import { assert } from "@axiom/utils";
import { debug } from "@debug";
import AssetManager, { AssetName } from "./assetManager";
import ResourcePool, { DEPTH_FORMATS, TextureDescriptor } from "./resourcePool";
import SharedBinds, { SamplerName } from "./sharedBinds";
import GpuTimer from "./timer";
import Aurora from "./core";

interface CanvasWriteOptions {
  loadOp: GPULoadOp;
  clearValue?: Readonly<RGBA>;
}
interface CanvasWrite {
  loadOp: GPULoadOp;
  clearValue?: GPUColor;
}
interface TextureWrite {
  name: string;
  desc: TextureDescriptor;
  loadOp: GPULoadOp;
  clearValue?: GPUColor;
  depthClearValue?: number;
  clear: boolean;
}
interface TextureTemp {
  name: string;
  key: string;
  desc: TextureDescriptor;
  clear: boolean;
}
export interface PipelineTargets {
  colors: GPUTextureFormat[];
  depth?: GPUTextureFormat;
}
export interface PassFormats {
  formats: ReadonlyMap<string, GPUTextureFormat>;
}
export interface PassTargets extends PipelineTargets, PassFormats {}
export interface StepColorTarget {
  name: string;
  mip?: number;
  clear?: Readonly<RGBA>;
}
export interface StepDepthTarget {
  name: string;
  clear?: number;
}
export interface StepRenderOptions {
  colors?: StepColorTarget[];
  depth?: StepDepthTarget;
}
type PassEncoders = {
  render: GPURenderPassEncoder;
  compute: GPUComputePassEncoder;
  multi: GPUCommandEncoder;
};
type PassSetups = {
  render: PassTargets;
  compute: PassFormats;
  multi: PassFormats;
};
type PassContexts = {
  render: PassContext;
  compute: PassContext;
  multi: MultiPassContext;
};

export abstract class Pass<T extends keyof PassEncoders = keyof PassEncoders> {
  abstract readonly name: string;
  abstract readonly type: T;
  category?: string;

  setup(targets: PassSetups[T]): Promise<void> | void {}
  resources(res: PassResources): void {}
  enabled(): boolean {
    return true;
  }
  destroy(): void {}
  /** clears vuffers and stuff here - beginning of a frame */
  clearFrame?(): void {}
  stats?(): Readonly<Record<string, number>>;
  abstract execute(encoder: PassEncoders[T], ctx: PassContexts[T]): void;
}

export abstract class RenderPass extends Pass<"render"> {
  public readonly type = "render";
}

export abstract class ComputePass extends Pass<"compute"> {
  public readonly type = "compute";
}

export abstract class MultiPass extends Pass<"multi"> {
  public readonly type = "multi";
}

export class PassResources {
  public canvas: CanvasWrite | null = null;
  public writes: TextureWrite[] = [];
  public reads: string[] = [];
  public modifies: string[] = [];
  public temps: TextureTemp[] = [];
  public unclearedModifies: Set<string> = new Set();
  public assets: AssetName[] = [];
  public reserved: string[] = [];
  public samplerName: SamplerName = "nearestClamp";
  private readonly passName: string;
  private readonly earlierWrites: ReadonlyMap<
    string,
    { desc: TextureDescriptor }
  >;

  constructor(
    passName: string,
    earlierWrites: ReadonlyMap<string, { desc: TextureDescriptor }>,
  ) {
    this.passName = passName;
    this.earlierWrites = earlierWrites;
  }

  // lets a pass skip a read that would fail validation
  public created(name: string) {
    return this.earlierWrites.has(name);
  }

  public readAsset(name: AssetName) {
    this.assets.push(name);
  }
  // a texture from ResourcePool.reserve: always available, so it never drops the pass;
  // its owner writes it outside the graph, an owner later in the preset means last frame's content
  public readReserved(name: string) {
    this.reserved.push(name);
  }
  public writeCanvas({ loadOp, clearValue }: CanvasWriteOptions) {
    this.canvas = {
      loadOp,
      clearValue: clearValue && Aurora.toCanvasColor(clearValue),
    };
  }
  public sampler(name: SamplerName) {
    this.samplerName = name;
  }
  public create(
    name: string,
    desc: TextureDescriptor,
    {
      clearValue,
      depthClearValue,
      clear = true,
    }: {
      clearValue?: Readonly<RGBA>;
      depthClearValue?: number;
      clear?: boolean;
    } = {},
  ) {
    this.writes.push({
      name,
      desc: { ...desc, label: name },
      loadOp: "clear",
      clearValue: clearValue && Aurora.toTargetColor(clearValue),
      depthClearValue,
      clear,
    });
  }
  public write(name: string) {
    const created = this.earlierWrites.get(name);
    assert(
      created !== undefined,
      `Pass "${this.passName}" writes "${name}", but no earlier pass in preset creates it`,
    );
    this.writes.push({
      name,
      desc: created.desc,
      loadOp: "load",
      clear: false,
    });
  }
  public read(name: string) {
    this.reads.push(name);
  }
  public modify(name: string, { clear = true }: { clear?: boolean } = {}) {
    this.modifies.push(name);
    if (!clear) this.unclearedModifies.add(name);
  }
  public temp(
    name: string,
    desc: TextureDescriptor,
    { clear = true }: { clear?: boolean } = {},
  ) {
    const key = `${this.passName}:${name}`;
    this.temps.push({ name, key, desc: { ...desc, label: key }, clear });
  }
}

export class PassContext {
  protected declared: PassResources;
  protected textures: Map<string, GPUTexture>;
  protected outputs: Map<string, GPUTexture> = new Map();

  constructor(declared: PassResources, textures: Map<string, GPUTexture>) {
    this.declared = declared;
    this.textures = textures;
  }
  public view(name: string, mip?: number) {
    assert(
      this.declared.reads.includes(name) ||
        this.declared.modifies.includes(name),
      `Pass reads "${name}" without declaring it in resources()`,
    );
    const texture = this.textures.get(name);
    assert(
      texture !== undefined,
      `Texture "${name}" was not written this frame`,
    );
    return ResourcePool.view(texture, mip);
  }
  public arrayView(name: string) {
    assert(
      this.declared.reads.includes(name) ||
        this.declared.modifies.includes(name),
      `Pass reads "${name}" without declaring it in resources()`,
    );
    const texture = this.textures.get(name);
    assert(
      texture !== undefined,
      `Texture "${name}" was not written this frame`,
    );
    return ResourcePool.arrayView(texture);
  }
  // lets a pass reused across rebuilds find the state of the build being executed
  public get getResources(): Readonly<PassResources> {
    return this.declared;
  }
  public size(name: string, mip = 0): Size2D {
    assert(
      this.declared.reads.includes(name) ||
        this.declared.modifies.includes(name) ||
        this.declared.writes.some((write) => write.name === name),
      `Pass requests size of "${name}" without declaring it in resources()`,
    );
    const texture = this.textures.get(name);
    assert(
      texture !== undefined,
      `Texture "${name}" was not written this frame`,
    );
    return {
      width: Math.max(1, texture.width >> mip),
      height: Math.max(1, texture.height >> mip),
    };
  }
  public output(name: string, mip?: number) {
    const texture = this.outputs.get(name);
    assert(
      texture !== undefined,
      `Pass requests output "${name}" without declaring create, write or modify in resources()`,
    );
    assert(
      mip !== undefined || texture.mipLevelCount === 1,
      `Output "${name}" has ${texture.mipLevelCount} mips, pass a mip level to ctx.output()`,
    );
    return ResourcePool.view(texture, mip);
  }
  public setOutput(name: string, texture: GPUTexture) {
    this.outputs.set(name, texture);
  }
  public clearOutputs() {
    this.outputs.clear();
  }
  public reserved(name: string, mip?: number) {
    assert(
      this.declared.reserved.includes(name),
      `Pass reads reserved "${name}" without declaring readReserved() in resources()`,
    );
    return ResourcePool.reservedView(name, mip);
  }
  public reservedArrayView(name: string) {
    assert(
      this.declared.reserved.includes(name),
      `Pass reads reserved "${name}" without declaring readReserved() in resources()`,
    );
    return ResourcePool.reservedArrayView(name);
  }
  public asset(name: AssetName) {
    assert(
      this.declared.assets.includes(name),
      `Pass reads asset "${name}" without declaring it in resources()`,
    );
    return AssetManager.getView(name);
  }
}

export class MultiPassContext extends PassContext {
  private readonly passName: string;
  private temps: Map<string, GPUTexture> = new Map();
  declare private encoder: GPUCommandEncoder;
  declare private canvasView: GPUTextureView;
  private canvasUsed = false;

  constructor(
    passName: string,
    declared: PassResources,
    textures: Map<string, GPUTexture>,
  ) {
    super(declared, textures);
    this.passName = passName;
  }

  public beginFrame(encoder: GPUCommandEncoder, canvasView: GPUTextureView) {
    this.encoder = encoder;
    this.canvasView = canvasView;
    this.canvasUsed = false;
  }
  public setTemp(name: string, texture: GPUTexture) {
    this.temps.set(name, texture);
  }
  public releaseTemps() {
    this.temps.forEach((texture) => ResourcePool.release(texture));
    this.temps.clear();
  }

  public view(name: string, mip?: number) {
    const temp = this.temps.get(name);
    if (temp) return ResourcePool.view(temp, mip);
    return super.view(name, mip);
  }
  public output(name: string, mip?: number) {
    const temp = this.temps.get(name);
    if (!temp) return super.output(name, mip);
    assert(
      mip !== undefined || temp.mipLevelCount === 1,
      `Temp "${name}" has ${temp.mipLevelCount} mips, pass a mip level to ctx.output()`,
    );
    return ResourcePool.view(temp, mip);
  }
  public size(name: string, mip = 0): Size2D {
    const texture = this.temps.get(name) ?? this.outputs.get(name);
    if (!texture) return super.size(name, mip);
    return {
      width: Math.max(1, texture.width >> mip),
      height: Math.max(1, texture.height >> mip),
    };
  }

  public beginRender(label: string, { colors = [], depth }: StepRenderOptions) {
    const colorAttachments: GPURenderPassColorAttachment[] = [];
    for (const target of colors) {
      if (target.name === "canvas") {
        const canvas = this.declared.canvas;
        assert(
          canvas !== null,
          `Pass "${this.passName}" draws to canvas without declaring writeCanvas() in resources()`,
        );
        const first = !this.canvasUsed;
        this.canvasUsed = true;
        colorAttachments.push({
          view: this.canvasView,
          loadOp:
            target.clear !== undefined
              ? "clear"
              : first
                ? canvas.loadOp
                : "load",
          clearValue: target.clear
            ? Aurora.toCanvasColor(target.clear)
            : canvas.clearValue,
          storeOp: "store",
        });
        continue;
      }
      colorAttachments.push({
        view: ResourcePool.view(this.target(target.name), target.mip ?? 0),
        loadOp: target.clear !== undefined ? "clear" : "load",
        clearValue: target.clear && Aurora.toTargetColor(target.clear),
        storeOp: "store",
      });
    }

    let depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined;
    if (depth) {
      const texture = this.target(depth.name);
      assert(
        DEPTH_FORMATS.has(texture.format),
        `Pass "${this.passName}" uses "${depth.name}" as depth, but it is not a depth texture`,
      );
      const loadOp: GPULoadOp = depth.clear !== undefined ? "clear" : "load";
      depthStencilAttachment = {
        view: ResourcePool.view(texture, 0),
        depthLoadOp: loadOp,
        depthClearValue: depth.clear ?? 1,
        depthStoreOp: "store",
      };
      if (texture.format.includes("stencil")) {
        depthStencilAttachment.stencilLoadOp = loadOp;
        depthStencilAttachment.stencilStoreOp = "store";
      }
    }

    const passLabel = `${this.passName}:${label}`;
    const renderPass = debug.aurora.watchRender(
      this.encoder.beginRenderPass({
        label: passLabel,
        colorAttachments,
        depthStencilAttachment,
        timestampWrites: GpuTimer.stepWrites(passLabel),
      }),
    );
    renderPass.setBindGroup(0, SharedBinds.getFrame);
    renderPass.setBindGroup(
      1,
      SharedBinds.getAssets(this.declared.samplerName),
    );
    return renderPass;
  }

  public beginCompute(label: string) {
    const passLabel = `${this.passName}:${label}`;
    const computePass = debug.aurora.watchCompute(
      this.encoder.beginComputePass({
        label: passLabel,
        timestampWrites: GpuTimer.stepWrites(passLabel),
      }),
    );
    computePass.setBindGroup(0, SharedBinds.getFrame);
    computePass.setBindGroup(
      1,
      SharedBinds.getAssets(this.declared.samplerName),
    );
    return computePass;
  }

  private target(name: string) {
    const texture = this.temps.get(name) ?? this.outputs.get(name);
    assert(
      texture !== undefined,
      `Pass "${this.passName}" draws to "${name}" without declaring create, write, modify or temp in resources()`,
    );
    return texture;
  }
}
