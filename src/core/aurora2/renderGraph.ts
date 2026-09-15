import { assert } from "../axiom/utils";
import AssetManager from "./assetManager";
import Aurora from "./core";
import { Pass, PassContext, PassResources, PassTargets } from "./pass";
import ResourcePool, {
  TextureDescriptor,
  DEPTH_FORMATS,
  STORAGE_FORMATS,
} from "./resourcePool";
import SharedBinds from "./sharedBinds";
import GpuTimer from "./timer";
export const ALL_STAGES =
  GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE;

export default class RenderGraph {
  private static passes: Pass[] = [];
  private static built = false;
  private static preset: (() => Pass[]) | null = null;
  private static buildId = 0;
  private static resources: Map<Pass, PassResources> = new Map();
  private static contexts: Map<Pass, PassContext> = new Map();
  private static frameTextures: Map<string, GPUTexture> = new Map();
  private static frameDescs: Map<string, TextureDescriptor> = new Map();
  private static activePasses: Pass[] = [];
  private static previousActive: Pass[] = [];
  private static lastUse: Map<string, number> = new Map();
  private static frameWritten: Set<string> = new Set();

  public static get getActivePassNames() {
    return this.activePasses.map((pass) => pass.name);
  }
  public static get isBuilt() {
    return this.built;
  }
  private static async buildPasses() {
    const id = ++this.buildId;
    const passes = this.preset!();
    const resources: Map<Pass, PassResources> = new Map();
    const contexts: Map<Pass, PassContext> = new Map();
    const targets: Map<Pass, PassTargets> = new Map();
    const written: Map<string, { desc: TextureDescriptor; pass: string }> =
      new Map();

    for (const pass of passes) {
      const declared = new PassResources();
      pass.resources(declared);
      this.validatePass(pass, declared, written);
      resources.set(pass, declared);
      contexts.set(pass, new PassContext(declared, this.frameTextures));

      const colors: GPUTextureFormat[] = [];
      let depth: GPUTextureFormat | undefined;
      for (const write of declared.writes) {
        if (DEPTH_FORMATS.has(write.desc.format)) depth = write.desc.format;
        else colors.push(write.desc.format);
      }
      for (const name of declared.modifies) {
        colors.push(written.get(name)!.desc.format);
      }
      if (declared.canvas)
        colors.push(navigator.gpu.getPreferredCanvasFormat());
      targets.set(pass, { colors, depth });
    }

    await Promise.all(passes.map((pass) => pass.setup(targets.get(pass)!)));

    if (id !== this.buildId) {
      for (const pass of passes) pass.destroy();
      return;
    }

    const oldPasses = this.passes;
    this.resources = resources;
    this.contexts = contexts;
    this.previousActive = [];
    this.passes = passes;
    SharedBinds.clearFrameDirty();
    for (const pass of oldPasses) pass.destroy();
  }
  public static async setPreset(preset: () => Pass[]) {
    this.preset = preset;
    if (!this.built) return;
    await this.buildPasses();
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
      const isLast = index === this.activePasses.length - 1;

      if (pass.type === "compute") this.executeCompute(encoder, pass, isLast);
      else this.executeRender(encoder, pass, isLast, canvasView);

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
        const writer = unread.get(write.name);
        if (writer !== undefined && write.loadOp === "clear") {
          console.warn(
            `"${write.name}" written by "${writer}" is never read before "${pass.name}" clears it`,
          );
        }
        unread.set(write.name, pass.name);
      }
    }

    unread.forEach((writer, name) => {
      console.warn(`"${name}" written by "${writer}" is never read this frame`);
    });
  }

  private static executeCompute(
    encoder: GPUCommandEncoder,
    pass: Pass,
    isLast: boolean,
  ) {
    const declared = this.resources.get(pass)!;
    const ctx = this.contexts.get(pass)!;
    ctx.clearOutputs();

    for (const write of declared.writes) {
      let texture = this.frameTextures.get(write.name);
      if (!texture) {
        texture = ResourcePool.acquire(write.desc);
        this.frameTextures.set(write.name, texture);
        this.frameDescs.set(write.name, write.desc);
      }
      if (write.loadOp === "clear") {
        const label = `${pass.name}:clear:${write.name}`;
        const clearPass = encoder.beginRenderPass({
          label,
          colorAttachments: [
            {
              view: ResourcePool.view(texture),
              loadOp: "clear",
              clearValue: write.clearValue,
              storeOp: "store",
            },
          ],
          timestampWrites: GpuTimer.passWrites(label, false),
        });
        clearPass.end();
      }
      ctx.setOutput(write.name, texture);
    }

    const newVersions: [string, GPUTexture][] = [];
    for (const name of declared.modifies) {
      assert(
        this.frameTextures.has(name),
        `Pass "${pass.name}" modifies "${name}" but nothing wrote it this frame`,
      );
      const output = ResourcePool.acquire(this.frameDescs.get(name)!);
      const label = `${pass.name}:clear:${name}`;
      const clearPass = encoder.beginRenderPass({
        label,
        colorAttachments: [
          {
            view: ResourcePool.view(output),
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        timestampWrites: GpuTimer.passWrites(label, false),
      });
      clearPass.end();
      ctx.setOutput(name, output);
      newVersions.push([name, output]);
    }

    const computePass = encoder.beginComputePass({
      label: pass.name,
      timestampWrites: GpuTimer.passWrites(pass.name, isLast),
    });
    computePass.setBindGroup(0, SharedBinds.getFrame);
    computePass.setBindGroup(1, SharedBinds.getAssets(declared.samplerName));
    pass.execute(computePass, ctx);
    computePass.end();

    for (const [name, output] of newVersions) {
      ResourcePool.release(this.frameTextures.get(name)!);
      this.frameTextures.set(name, output);
    }
  }
  private static executeRender(
    encoder: GPUCommandEncoder,
    pass: Pass,
    isLast: boolean,
    canvasView: GPUTextureView,
  ) {
    const declared = this.resources.get(pass)!;
    const ctx = this.contexts.get(pass)!;
    const colorAttachments: GPURenderPassColorAttachment[] = [];
    let depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined;

    for (const write of declared.writes) {
      let texture = this.frameTextures.get(write.name);
      if (!texture) {
        texture = ResourcePool.acquire(write.desc);
        this.frameTextures.set(write.name, texture);
        this.frameDescs.set(write.name, write.desc);
      }

      if (DEPTH_FORMATS.has(write.desc.format)) {
        assert(
          depthStencilAttachment === undefined,
          `Pass "${pass.name}" writes more than one depth texture`,
        );
        depthStencilAttachment = {
          view: ResourcePool.view(texture),
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

      colorAttachments.push({
        view: ResourcePool.view(texture),
        loadOp: write.loadOp,
        clearValue: write.clearValue,
        storeOp: "store",
      });
    }

    const newVersions: [string, GPUTexture][] = [];
    for (const name of declared.modifies) {
      assert(
        this.frameTextures.has(name),
        `Pass "${pass.name}" modifies "${name}" but nothing wrote it this frame`,
      );
      const output = ResourcePool.acquire(this.frameDescs.get(name)!);
      colorAttachments.push({
        view: ResourcePool.view(output),
        loadOp: "clear",
        storeOp: "store",
      });
      newVersions.push([name, output]);
    }

    if (declared.canvas) {
      colorAttachments.push({
        view: canvasView,
        loadOp: declared.canvas.loadOp,
        clearValue: declared.canvas.clearValue,
        storeOp: "store",
      });
    }

    const renderPass = encoder.beginRenderPass({
      label: pass.name,
      colorAttachments,
      depthStencilAttachment,
      timestampWrites: GpuTimer.passWrites(pass.name, isLast),
    });
    renderPass.setBindGroup(0, SharedBinds.getFrame);
    renderPass.setBindGroup(1, SharedBinds.getAssets(declared.samplerName));
    pass.execute(renderPass, ctx);
    renderPass.end();

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
        `Pass "${pass.name}" reads "${name}", but no earlier pass in preset writes it`,
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
        `Pass "${pass.name}" modifies "${name}", but no earlier pass in preset writes it`,
      );
      assert(
        !DEPTH_FORMATS.has(written.get(name)!.desc.format),
        `Pass "${pass.name}" modifies depth texture "${name}", which is not supported`,
      );
    }
    for (const write of declared.writes) {
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
}
