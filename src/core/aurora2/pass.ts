import { assert } from "../axiom/utils";
import AssetManager, { AssetName } from "./assetManager";
import ResourcePool, { TextureDescriptor } from "./resourcePool";
import { SamplerName } from "./sharedBinds";

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
}
export interface PassTargets {
  colors: GPUTextureFormat[];
  depth?: GPUTextureFormat;
}
type PassEncoders = {
  render: GPURenderPassEncoder;
  compute: GPUComputePassEncoder;
};

export abstract class Pass<T extends keyof PassEncoders = keyof PassEncoders> {
  abstract readonly name: string;
  abstract readonly type: T;

  setup(targets: PassTargets): Promise<void> | void {}
  resources(res: PassResources): void {}
  enabled(): boolean {
    return true;
  }
  destroy(): void {}
  abstract execute(encoder: PassEncoders[T], ctx: PassContext): void;
}

export class PassResources {
  public canvas: CanvasWrite | null = null;
  public writes: TextureWrite[] = [];
  public reads: string[] = [];
  public modifies: string[] = [];
  public assets: AssetName[] = [];
  public samplerName: SamplerName = "nearestClamp";

  public readAsset(name: AssetName) {
    this.assets.push(name);
  }
  public writeCanvas(options: CanvasWrite) {
    this.canvas = options;
  }
  public sampler(name: SamplerName) {
    this.samplerName = name;
  }
  public write(
    name: string,
    desc: TextureDescriptor,
    options: {
      loadOp: GPULoadOp;
      clearValue?: GPUColor;
      depthClearValue?: number;
    },
  ) {
    this.writes.push({ name, desc: { ...desc, label: name }, ...options });
  }
  public read(name: string) {
    this.reads.push(name);
  }
  public modify(name: string) {
    this.modifies.push(name);
  }
}

export class PassContext {
  private declared: PassResources;
  private textures: Map<string, GPUTexture>;
  private outputs: Map<string, GPUTexture> = new Map();

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
  public output(name: string, mip?: number) {
    const texture = this.outputs.get(name);
    assert(
      texture !== undefined,
      `Pass requests output "${name}" without declaring write or modify in resources()`,
    );
    return ResourcePool.view(texture, mip);
  }
  public setOutput(name: string, texture: GPUTexture) {
    this.outputs.set(name, texture);
  }
  public clearOutputs() {
    this.outputs.clear();
  }
  public asset(name: AssetName) {
    assert(
      this.declared.assets.includes(name),
      `Pass reads asset "${name}" without declaring it in resources()`,
    );
    return AssetManager.getView(name);
  }
}
