import { assert } from "@axiom/utils";
import { debug } from "@debug";
import AssetManager, { AssetName } from "./assetManager";
import Aurora from "./core";
import {
  MultiPassContext,
  Pass,
  PassContext,
  PassFormats,
  PassResources,
  PassTargets,
} from "./pass";
import ResourcePool, {
  TextureDescriptor,
  DEPTH_FORMATS,
  STORAGE_FORMATS,
} from "./resourcePool";
import SharedBinds from "./sharedBinds";
import GpuTimer from "./timer";
import type { RenderPreset } from "./preset";

export interface GraphTexture {
  name: string;
  kind: "graph" | "temp" | "asset" | "reserved";
  format: GPUTextureFormat;
  width: number;
  height: number;
  mips: number;
  layers: number;
  createdBy: string;
  usedBy: string[];
}

export default class RenderGraph {
  private static passes: Pass[] = [];
  private static built = false;
  private static preset: RenderPreset | null = null;
  private static buildId = 0;
  private static resources: Map<Pass, PassResources> = new Map();
  private static contexts: Map<Pass, PassContext> = new Map();
  private static frameTextures: Map<string, GPUTexture> = new Map();
  private static frameDescs: Map<string, TextureDescriptor> = new Map();
  private static activePasses: Pass[] = [];
  private static previousActive: Pass[] = [];
  private static lastUse: Map<string, number> = new Map();
  private static frameWritten: Set<string> = new Set();

  public static get getActivePasses(): readonly Pass[] {
    return this.activePasses;
  }
  // derived from declarations of the current frame, so execute() records nothing extra
  public static describeResources(): GraphTexture[] {
    const textures: Map<string, GraphTexture> = new Map();
    const assets: Map<AssetName, GraphTexture> = new Map();
    const reserved: Map<string, GraphTexture> = new Map();
    const use = (texture: GraphTexture | undefined, pass: string) => {
      if (texture && !texture.usedBy.includes(pass)) texture.usedBy.push(pass);
    };

    for (const pass of this.activePasses) {
      const declared = this.resources.get(pass)!;
      for (const write of declared.writes) {
        if (write.loadOp === "load" || textures.has(write.name)) {
          use(textures.get(write.name), pass.name);
          continue;
        }
        textures.set(
          write.name,
          this.describeTexture(write.name, "graph", write.desc, pass.name),
        );
      }
      for (const name of declared.reads) use(textures.get(name), pass.name);
      for (const name of declared.modifies) use(textures.get(name), pass.name);
      for (const temp of declared.temps) {
        textures.set(
          temp.key,
          this.describeTexture(temp.key, "temp", temp.desc, pass.name),
        );
      }
      for (const name of declared.assets) {
        if (!assets.has(name)) {
          const texture = AssetManager.getAssetTexture(name);
          if (!texture) continue;
          assets.set(name, {
            name,
            kind: "asset",
            format: texture.format,
            width: texture.width,
            height: texture.height,
            mips: texture.mipLevelCount,
            layers: texture.depthOrArrayLayers,
            createdBy: "assets",
            usedBy: [],
          });
        }
        use(assets.get(name), pass.name);
      }
      for (const name of declared.reserved) {
        const texture = ResourcePool.getReserved.get(name)?.texture;
        if (!texture) continue;
        if (!reserved.has(name)) {
          reserved.set(name, {
            name,
            kind: "reserved",
            format: texture.format,
            width: texture.width,
            height: texture.height,
            mips: texture.mipLevelCount,
            layers: texture.depthOrArrayLayers,
            createdBy: "reserved",
            usedBy: [],
          });
        }
        use(reserved.get(name), pass.name);
      }
    }
    return [...textures.values(), ...assets.values(), ...reserved.values()];
  }
  private static describeTexture(
    name: string,
    kind: GraphTexture["kind"],
    desc: TextureDescriptor,
    createdBy: string,
  ): GraphTexture {
    const { width, height } = ResourcePool.resolveSize(desc.size);
    return {
      name,
      kind,
      format: desc.format,
      width,
      height,
      mips: desc.mips ?? 1,
      layers: desc.layers ?? 1,
      createdBy,
      usedBy: [],
    };
  }
  public static get isBuilt() {
    return this.built;
  }
  private static async buildPasses() {
    const id = ++this.buildId;
    const passes = this.preset!.passes();
    const resources: Map<Pass, PassResources> = new Map();
    const contexts: Map<Pass, PassContext> = new Map();
    const targets: Map<Pass, PassTargets | PassFormats> = new Map();
    const written: Map<string, { desc: TextureDescriptor; pass: string }> =
      new Map();
    const names: Set<string> = new Set();
    for (const pass of passes) {
      assert(
        !names.has(pass.name),
        `Preset has more than one pass named "${pass.name}", pass names must be unique`,
      );
      names.add(pass.name);
      const declared = new PassResources(pass.name, written);
      pass.resources(declared);
      this.validatePass(pass, declared, written);
      resources.set(pass, declared);
      contexts.set(
        pass,
        pass.type === "multi"
          ? new MultiPassContext(pass.name, declared, this.frameTextures)
          : new PassContext(declared, this.frameTextures),
      );

      const colors: GPUTextureFormat[] = [];
      const formats: Map<string, GPUTextureFormat> = new Map();
      let depth: GPUTextureFormat | undefined;
      for (const write of declared.writes) {
        formats.set(write.name, write.desc.format);
        if (DEPTH_FORMATS.has(write.desc.format)) depth = write.desc.format;
        else colors.push(write.desc.format);
      }
      for (const name of declared.modifies) {
        const format = written.get(name)!.desc.format;
        formats.set(name, format);
        colors.push(format);
      }
      for (const name of declared.reads) {
        formats.set(name, written.get(name)!.desc.format);
      }
      for (const temp of declared.temps) {
        formats.set(temp.name, temp.desc.format);
      }
      if (declared.canvas) {
        formats.set("canvas", Aurora.getCanvasFormat);
        colors.push(Aurora.getCanvasFormat);
      }
      targets.set(
        pass,
        pass.type === "render" ? { colors, depth, formats } : { formats },
      );
    }

    await Promise.all(passes.map((pass) => pass.setup(targets.get(pass)!)));

    // a preset may return the same pass instance in every build, destroy only what leaves the graph
    if (id !== this.buildId) {
      for (const pass of passes) {
        if (!this.passes.includes(pass)) pass.destroy();
      }
      return;
    }

    const oldPasses = this.passes;
    this.resources = resources;
    this.contexts = contexts;
    this.previousActive = [];
    // old passes have no declarations in the new maps, next resolveFrame fills this again
    this.activePasses.length = 0;
    this.passes = passes;
    SharedBinds.clearFrameDirty();
    for (const pass of oldPasses) {
      if (!passes.includes(pass)) pass.destroy();
    }
  }
  public static get getPreset(): RenderPreset | null {
    return this.preset;
  }
  public static async setPreset(preset: RenderPreset) {
    this.preset = preset;
    if (!this.built) return;
    await this.buildPasses();
  }
  public static beginFrame() {
    for (const pass of this.passes) pass.clearFrame?.();
  }
  public static async rebuild() {
    assert(
      this.preset !== null,
      "RenderGraph.rebuild() called without a preset",
    );
    await this.buildPasses();
  }
  public static async build() {
    assert(
      this.preset !== null,
      "RenderGraph.setPreset() must be called before the engine starts",
    );
    await this.buildPasses();
    this.built = true;
  }

  public static execute() {
    if (SharedBinds.isFrameDirty) return;
    const encoder = Aurora.device.createCommandEncoder({
      label: "frameEncoder",
    });
    const canvasView = Aurora.context.getCurrentTexture().createView();
    this.resolveFrame();
    GpuTimer.beginFrame();

    for (let index = 0; index < this.activePasses.length; index++) {
      const pass = this.activePasses[index];
      GpuTimer.beginPass(pass.name);
      debug.aurora.beginPass(pass);

      if (pass.type === "compute") this.executeCompute(encoder, pass);
      else if (pass.type === "multi")
        this.executeMulti(encoder, pass, canvasView);
      else this.executeRender(encoder, pass, canvasView);

      this.lastUse.forEach((last, name) => {
        if (last !== index) return;
        ResourcePool.release(this.frameTextures.get(name)!);
        this.frameTextures.delete(name);
        this.frameDescs.delete(name);
      });
    }

    GpuTimer.resolve(encoder);
    Aurora.device.queue.submit([encoder.finish()]);
    GpuTimer.read();

    assert(
      this.frameTextures.size === 0,
      `${this.frameTextures.size} frame textures were not released`,
    );
  }
  private static resolveFrame() {
    this.activePasses.length = 0;
    this.lastUse.clear();
    this.frameWritten.clear();

    for (const pass of this.passes) {
      if (!pass.enabled()) continue;
      const declared = this.resources.get(pass)!;

      let missingInput = false;
      for (const name of declared.reads)
        if (!this.frameWritten.has(name)) missingInput = true;
      for (const name of declared.modifies)
        if (!this.frameWritten.has(name)) missingInput = true;
      for (const write of declared.writes)
        if (write.loadOp === "load" && !this.frameWritten.has(write.name))
          missingInput = true;
      if (missingInput) continue;

      const index = this.activePasses.length;
      this.activePasses.push(pass);
      for (const write of declared.writes) {
        this.frameWritten.add(write.name);
        this.lastUse.set(write.name, index);
      }
      for (const name of declared.reads) this.lastUse.set(name, index);
      for (const name of declared.modifies) this.lastUse.set(name, index);
    }
    let changed = this.previousActive.length !== this.activePasses.length;
    for (let i = 0; !changed && i < this.activePasses.length; i++) {
      if (this.previousActive[i] !== this.activePasses[i]) changed = true;
    }
    if (!changed) return;
    this.previousActive = this.activePasses.slice();
    this.warnDeadWrites();
  }
  private static warnDeadWrites() {
    const unread: Map<string, string> = new Map();

    for (const pass of this.activePasses) {
      const declared = this.resources.get(pass)!;
      for (const name of declared.reads) unread.delete(name);
      for (const name of declared.modifies) unread.set(name, pass.name);
      for (const write of declared.writes) {
        if (DEPTH_FORMATS.has(write.desc.format)) continue;
        const writer = unread.get(write.name);
        if (writer !== undefined && write.loadOp === "clear") {
          debug.log
            .scope("aurora")
            .once(`clear|${writer}|${write.name}|${pass.name}`)
            .warn(
              `"${write.name}" written by "${writer}" is never read before "${pass.name}" clears it`,
            );
        }
        unread.set(write.name, pass.name);
      }
    }

    unread.forEach((writer, name) => {
      debug.log
        .scope("aurora")
        .once(`unread|${writer}|${name}`)
        .warn(`"${name}" written by "${writer}" is never read this frame`);
    });
  }

  private static executeCompute(encoder: GPUCommandEncoder, pass: Pass) {
    const declared = this.resources.get(pass)!;
    const ctx = this.contexts.get(pass)!;
    ctx.clearOutputs();

    for (const write of declared.writes) {
      const texture = this.frameTexture(write.name, write.desc);
      if (write.clear) {
        this.clearMips(
          encoder,
          `${pass.name}:clear:${write.name}`,
          texture,
          0,
          write.clearValue,
        );
      }
      ctx.setOutput(write.name, texture);
    }

    const newVersions = this.newVersions(encoder, pass, declared, ctx, 0);

    const computePass = debug.aurora.watchCompute(
      encoder.beginComputePass({
        label: pass.name,
        timestampWrites: GpuTimer.stepWrites(pass.name),
      }),
    );
    computePass.setBindGroup(0, SharedBinds.getFrame);
    computePass.setBindGroup(1, SharedBinds.getAssets(declared.samplerName));
    pass.execute(computePass, ctx);
    computePass.end();

    this.swapVersions(newVersions);
  }
  private static executeRender(
    encoder: GPUCommandEncoder,
    pass: Pass,
    canvasView: GPUTextureView,
  ) {
    const declared = this.resources.get(pass)!;
    const ctx = this.contexts.get(pass)!;
    const colorAttachments: GPURenderPassColorAttachment[] = [];
    let depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined;

    for (const write of declared.writes) {
      const texture = this.frameTexture(write.name, write.desc);

      if (DEPTH_FORMATS.has(write.desc.format)) {
        assert(
          depthStencilAttachment === undefined,
          `Pass "${pass.name}" writes more than one depth texture`,
        );
        depthStencilAttachment = {
          view: ResourcePool.view(texture, 0),
          depthLoadOp: write.loadOp,
          depthClearValue: write.depthClearValue ?? 1,
          depthStoreOp: "store",
        };
        if (write.desc.format.includes("stencil")) {
          depthStencilAttachment.stencilLoadOp = write.loadOp;
          depthStencilAttachment.stencilStoreOp = "store";
        }
        continue;
      }

      if (write.clear) {
        this.clearMips(
          encoder,
          `${pass.name}:clear:${write.name}`,
          texture,
          1,
          write.clearValue,
        );
      }
      colorAttachments.push({
        view: ResourcePool.view(texture, 0),
        loadOp: write.loadOp,
        clearValue: write.clearValue,
        storeOp: "store",
      });
    }

    const newVersions = this.newVersions(encoder, pass, declared, ctx, 1);
    for (const [, output] of newVersions) {
      colorAttachments.push({
        view: ResourcePool.view(output, 0),
        loadOp: "clear",
        storeOp: "store",
      });
    }

    if (declared.canvas) {
      colorAttachments.push({
        view: canvasView,
        loadOp: declared.canvas.loadOp,
        clearValue: declared.canvas.clearValue,
        storeOp: "store",
      });
    }

    const renderPass = debug.aurora.watchRender(
      encoder.beginRenderPass({
        label: pass.name,
        colorAttachments,
        depthStencilAttachment,
        timestampWrites: GpuTimer.stepWrites(pass.name),
      }),
    );
    renderPass.setBindGroup(0, SharedBinds.getFrame);
    renderPass.setBindGroup(1, SharedBinds.getAssets(declared.samplerName));
    pass.execute(renderPass, ctx);
    renderPass.end();

    this.swapVersions(newVersions);
  }
  private static executeMulti(
    encoder: GPUCommandEncoder,
    pass: Pass,
    canvasView: GPUTextureView,
  ) {
    const declared = this.resources.get(pass)!;
    const ctx = this.contexts.get(pass)! as MultiPassContext;
    ctx.clearOutputs();

    for (const write of declared.writes) {
      const texture = this.frameTexture(write.name, write.desc);
      if (write.clear) {
        this.clearTexture(
          encoder,
          `${pass.name}:clear:${write.name}`,
          texture,
          write.clearValue,
          write.depthClearValue,
        );
      }
      ctx.setOutput(write.name, texture);
    }

    const newVersions = this.newVersions(encoder, pass, declared, ctx, 0);

    for (const temp of declared.temps) {
      const texture = ResourcePool.acquire(temp.desc);
      if (temp.clear) {
        this.clearTexture(encoder, `${pass.name}:clear:${temp.name}`, texture);
      }
      ctx.setTemp(temp.name, texture);
    }

    ctx.beginFrame(encoder, canvasView);
    pass.execute(encoder, ctx);
    ctx.releaseTemps();

    this.swapVersions(newVersions);
  }

  private static frameTexture(name: string, desc: TextureDescriptor) {
    let texture = this.frameTextures.get(name);
    if (!texture) {
      texture = ResourcePool.acquire(desc);
      this.frameTextures.set(name, texture);
      this.frameDescs.set(name, desc);
    }
    return texture;
  }
  private static newVersions(
    encoder: GPUCommandEncoder,
    pass: Pass,
    declared: PassResources,
    ctx: PassContext,
    fromMip: number,
  ) {
    const newVersions: [string, GPUTexture][] = [];
    for (const name of declared.modifies) {
      assert(
        this.frameTextures.has(name),
        `Pass "${pass.name}" modifies "${name}" but nothing wrote it this frame`,
      );
      const output = ResourcePool.acquire(this.frameDescs.get(name)!);
      if (!declared.unclearedModifies.has(name)) {
        this.clearMips(encoder, `${pass.name}:clear:${name}`, output, fromMip);
      }
      ctx.setOutput(name, output);
      newVersions.push([name, output]);
    }
    return newVersions;
  }
  private static swapVersions(newVersions: [string, GPUTexture][]) {
    for (const [name, output] of newVersions) {
      ResourcePool.release(this.frameTextures.get(name)!);
      this.frameTextures.set(name, output);
    }
  }

  private static validatePass(
    pass: Pass,
    declared: PassResources,
    written: Map<string, { desc: TextureDescriptor; pass: string }>,
  ) {
    for (const name of declared.reads) {
      assert(
        written.has(name),
        `Pass "${pass.name}" reads "${name}", but no earlier pass in preset creates it`,
      );
    }
    for (const name of declared.assets) {
      assert(
        AssetManager.hasAsset(name),
        `Pass "${pass.name}" reads asset "${name}", but it is disabled in config`,
      );
    }
    for (const name of declared.modifies) {
      assert(
        written.has(name),
        `Pass "${pass.name}" modifies "${name}", but no earlier pass in preset creates it`,
      );
      assert(
        !DEPTH_FORMATS.has(written.get(name)!.desc.format),
        `Pass "${pass.name}" modifies depth texture "${name}", which is not supported`,
      );
    }
    for (const write of declared.writes) {
      assert(
        (write.desc.dimension ?? "2d") === "2d",
        `Pass "${pass.name}" writes "${write.name}" as ${write.desc.dimension}, graph textures are 2d (reserve a 3d one)`,
      );
      assert(
        !declared.reads.includes(write.name) &&
          !declared.modifies.includes(write.name),
        `Pass "${pass.name}" writes "${write.name}" and also reads or modifies it, use only modify() to read and write the same texture`,
      );
      assert(
        !DEPTH_FORMATS.has(write.desc.format) || (write.desc.mips ?? 1) === 1,
        `Pass "${pass.name}" writes depth texture "${write.name}" with mips, which is not supported`,
      );
      const first = written.get(write.name);
      if (!first) {
        written.set(write.name, { desc: write.desc, pass: pass.name });
        continue;
      }
      assert(
        this.sameDescriptor(first.desc, write.desc),
        `Pass "${pass.name}" writes "${write.name}" with a different descriptor than "${first.pass}"`,
      );
    }

    assert(
      declared.temps.length === 0 || pass.type === "multi",
      `Pass "${pass.name}" declares temp textures, which are only available in MultiPass`,
    );
    const tempNames: Set<string> = new Set();
    for (const temp of declared.temps) {
      assert(
        !tempNames.has(temp.name),
        `Pass "${pass.name}" declares temp "${temp.name}" more than once`,
      );
      tempNames.add(temp.name);
      assert(
        temp.name !== "canvas" &&
          !declared.reads.includes(temp.name) &&
          !declared.modifies.includes(temp.name) &&
          !declared.writes.some((write) => write.name === temp.name),
        `Pass "${pass.name}" declares temp "${temp.name}" with a name already used in this pass`,
      );
      assert(
        (temp.desc.dimension ?? "2d") === "2d",
        `Pass "${pass.name}" declares temp "${temp.name}" as ${temp.desc.dimension}, graph textures are 2d (reserve a 3d one)`,
      );
      assert(
        !DEPTH_FORMATS.has(temp.desc.format) || (temp.desc.mips ?? 1) === 1,
        `Pass "${pass.name}" declares depth temp "${temp.name}" with mips, which is not supported`,
      );
    }

    if (pass.type === "render") {
      assert(
        declared.writes.length > 0 ||
          declared.modifies.length > 0 ||
          declared.canvas !== null,
        `Render pass "${pass.name}" has no targets, declare write(), modify() or writeCanvas() in resources()`,
      );
    }
    if (pass.type === "compute") {
      assert(
        declared.canvas === null,
        `Pass "${pass.name}" is compute and cannot write to canvas`,
      );
      for (const write of declared.writes) {
        assert(
          STORAGE_FORMATS.has(write.desc.format),
          `Pass "${pass.name}" writes "${write.name}" in compute, but format ${write.desc.format} cannot be used as storage`,
        );
      }
      for (const name of declared.modifies) {
        const format = written.get(name)!.desc.format;
        assert(
          STORAGE_FORMATS.has(format),
          `Pass "${pass.name}" modifies "${name}" in compute, but format ${format} cannot be used as storage`,
        );
      }
    }
  }
  private static sameDescriptor(a: TextureDescriptor, b: TextureDescriptor) {
    if (a.format !== b.format) return false;
    if ((a.layers ?? 1) !== (b.layers ?? 1)) return false;
    if ((a.mips ?? 1) !== (b.mips ?? 1)) return false;
    if ("scale" in a.size && "scale" in b.size) {
      return (
        a.size.scale === b.size.scale &&
        (a.size.base ?? "render") === (b.size.base ?? "render")
      );
    }
    if ("width" in a.size && "width" in b.size) {
      return a.size.width === b.size.width && a.size.height === b.size.height;
    }
    return false;
  }
  private static clearTexture(
    encoder: GPUCommandEncoder,
    label: string,
    texture: GPUTexture,
    clearValue?: GPUColor,
    depthClearValue?: number,
  ) {
    if (!DEPTH_FORMATS.has(texture.format)) {
      this.clearMips(encoder, label, texture, 0, clearValue);
      return;
    }
    const depthStencilAttachment: GPURenderPassDepthStencilAttachment = {
      view: ResourcePool.view(texture, 0),
      depthLoadOp: "clear",
      depthClearValue: depthClearValue ?? 1,
      depthStoreOp: "store",
    };
    if (texture.format.includes("stencil")) {
      depthStencilAttachment.stencilLoadOp = "clear";
      depthStencilAttachment.stencilStoreOp = "store";
    }
    debug.aurora.watchClear();
    encoder
      .beginRenderPass({
        label,
        colorAttachments: [],
        depthStencilAttachment,
        timestampWrites: GpuTimer.stepWrites(label),
      })
      .end();
  }
  private static clearMips(
    encoder: GPUCommandEncoder,
    label: string,
    texture: GPUTexture,
    fromMip: number,
    clearValue?: GPUColor,
  ) {
    for (let mip = fromMip; mip < texture.mipLevelCount; mip++) {
      const mipLabel = `${label}:mip${mip}`;
      debug.aurora.watchClear();
      encoder
        .beginRenderPass({
          label: mipLabel,
          colorAttachments: [
            {
              view: ResourcePool.view(texture, mip),
              loadOp: "clear",
              clearValue,
              storeOp: "store",
            },
          ],
          timestampWrites: GpuTimer.stepWrites(mipLabel),
        })
        .end();
    }
  }
}
