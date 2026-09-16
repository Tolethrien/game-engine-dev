import { assert } from "@axiom/utils";
import Aurora from "./core";

type SizeBase = "render" | "canvas";
type TextureSize =
  { scale: number; base?: SizeBase } | { width: number; height: number };
export interface TextureDescriptor {
  size: TextureSize;
  layers?: number;
  label?: string;
  format: GPUTextureFormat;
  mips?: number;
}
export const DEPTH_FORMATS: ReadonlySet<GPUTextureFormat> = new Set([
  "depth16unorm",
  "depth24plus",
  "depth24plus-stencil8",
  "depth32float",
]);
export const STORAGE_FORMATS: ReadonlySet<GPUTextureFormat> = new Set([
  "rgba8unorm",
  "rgba16float",
  "rgba32float",
  "r32float",
]);
export default class ResourcePool {
  private static texturesFree: Map<string, GPUTexture[]> = new Map();
  private static texturesUsed: Map<GPUTexture, string> = new Map();
  private static views: Map<GPUTexture, Map<number, GPUTextureView>> =
    new Map();

  public static get getTextureCount() {
    let count = this.texturesUsed.size;
    this.texturesFree.forEach((list) => (count += list.length));
    return count;
  }
  public static acquire(desc: TextureDescriptor): GPUTexture {
    const key = this.key(desc);
    let list = this.texturesFree.get(key);
    if (!list) this.texturesFree.set(key, (list = []));
    const tex = list.pop() ?? this.createTexture(desc, key);
    tex.label = desc.label ?? key;
    this.texturesUsed.set(tex, key);

    return tex;
  }

  public static release(tex: GPUTexture) {
    const key = this.texturesUsed.get(tex);
    assert(
      key !== undefined,
      `Releasing texture: ${tex.label} - that is not in use`,
    );
    tex.label = key;
    this.texturesUsed.delete(tex);
    this.texturesFree.get(key)!.push(tex);
  }
  private static key(desc: TextureDescriptor) {
    const { width, height } = this.resolveSize(desc.size);
    return `${this.sizeBase(desc.size)}|${desc.format}|${width}|${height}|${desc.layers ?? 1}|${desc.mips ?? 1}`;
  }
  private static sizeBase(size: TextureSize) {
    return "scale" in size ? (size.base ?? "render") : "fixed";
  }
  private static resolveSize(size: TextureSize): Size2D {
    if (!("scale" in size)) return size;
    const base =
      size.base === "canvas"
        ? { width: Aurora.canvas.width, height: Aurora.canvas.height }
        : Aurora.getRenderSize;
    return {
      width: Math.max(1, Math.floor(base.width * size.scale)),
      height: Math.max(1, Math.floor(base.height * size.scale)),
    };
  }

  private static createTexture(desc: TextureDescriptor, key: string) {
    const size = this.resolveSize(desc.size);
    const mips = desc.mips ?? 1;
    const maxMips =
      Math.floor(Math.log2(Math.max(size.width, size.height))) + 1;
    assert(
      mips <= maxMips,
      `Texture "${key}" requests ${mips} mips, but ${size.width}x${size.height} allows at most ${maxMips}`,
    );
    return Aurora.device.createTexture({
      format: desc.format,
      size: {
        width: size.width,
        height: size.height,
        depthOrArrayLayers: desc.layers ?? 1,
      },
      usage: this.textureUsage(desc.format),
      mipLevelCount: mips,
      label: key,
    });
  }
  public static view(tex: GPUTexture, mip?: number): GPUTextureView {
    const key = this.texturesUsed.get(tex);
    assert(
      key !== undefined,
      `Requesting view of texture: ${tex.label} - that is not in use`,
    );

    let texViews = this.views.get(tex);
    if (!texViews) {
      texViews = new Map();
      this.views.set(tex, texViews);
    }

    const slot = mip ?? -1; //-1 means all mips
    let view = texViews.get(slot);
    if (!view) {
      const desc: GPUTextureViewDescriptor = {
        label: `${key}|mip:${mip ?? "all"}`,
      };
      if (mip !== undefined) {
        desc.baseMipLevel = mip;
        desc.mipLevelCount = 1;
      }
      view = tex.createView(desc);
      texViews.set(slot, view);
    }
    return view;
  }
  public static clearAll() {
    this.texturesFree.forEach((list) =>
      list.forEach((texture) => texture.destroy()),
    );
    this.texturesUsed.forEach((name, texture) => texture.destroy());
    this.texturesFree.clear();
    this.texturesUsed.clear();
    this.views.clear();
  }
  public static clear(base: SizeBase) {
    assert(
      this.texturesUsed.size === 0,
      `Clearing pool (${base}) while ${this.texturesUsed.size} textures are still in use`,
    );
    const prefix = `${base}|`;
    this.texturesFree.forEach((list, key) => {
      if (!key.startsWith(prefix)) return;
      list.forEach((texture) => {
        texture.destroy();
        this.views.delete(texture);
      });
      this.texturesFree.delete(key);
    });
  }

  private static textureUsage(format: GPUTextureFormat): GPUTextureUsageFlags {
    if (DEPTH_FORMATS.has(format))
      return (
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      );

    let usage =
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST;
    if (STORAGE_FORMATS.has(format)) usage |= GPUTextureUsage.STORAGE_BINDING;
    return usage;
  }
}
