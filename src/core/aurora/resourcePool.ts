import { assert } from "@axiom/utils";
import { debug } from "@debug";
import Aurora from "./core";

type SizeBase = "render" | "canvas";
type TextureSize =
  { scale: number; base?: SizeBase } | { width: number; height: number };
export interface TextureDescriptor {
  size: TextureSize;
  // depth of a 3d texture
  layers?: number;
  label?: string;
  format: GPUTextureFormat;
  mips?: number;
  // "3d" only for reserved textures, the graph works on 2d
  dimension?: "2d" | "3d";
}
interface Reservation {
  texture: GPUTexture;
  key: string;
  owners: number;
  views: Map<number, GPUTextureView>;
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
// view cache slot next to mip levels (-1 = all mips)
const ARRAY_VIEW = -2;
export default class ResourcePool {
  private static texturesFree: Map<string, GPUTexture[]> = new Map();
  private static texturesUsed: Map<GPUTexture, string> = new Map();
  private static views: Map<GPUTexture, Map<number, GPUTextureView>> =
    new Map();
  private static reserved: Map<string, Reservation> = new Map();

  public static get getPoolTextures() {
    return {
      used: this.texturesUsed as ReadonlyMap<GPUTexture, string>,
      free: this.texturesFree as ReadonlyMap<string, readonly GPUTexture[]>,
    };
  }
  public static acquire(desc: TextureDescriptor): GPUTexture {
    const key = this.key(desc);
    let list = this.texturesFree.get(key);
    if (!list) this.texturesFree.set(key, (list = []));
    const tex = list.pop() ?? this.createTexture(desc, key);
    tex.label = desc.label ?? key;
    this.texturesUsed.set(tex, key);
    debug.aurora.poolAcquire(tex);
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
    debug.aurora.poolRelease(tex);
  }
  public static get getReserved(): ReadonlyMap<string, { texture: GPUTexture }> {
    return this.reserved;
  }
  // a texture outside the pool: never reused, never cleared on resize, alive until every owner
  // frees it. Reserving a taken name shares the texture, so a pass rebuilt with the same
  // reservation keeps it (the new pass sets up before the old one is destroyed)
  public static reserve(name: string, desc: TextureDescriptor) {
    assert(
      !("scale" in desc.size),
      `Reserved texture "${name}" needs a fixed size, a render or canvas scale would go stale on resize`,
    );
    const key = this.key(desc);
    const taken = this.reserved.get(name);
    if (taken) {
      assert(
        taken.key === key,
        `Texture "${name}" is already reserved as ${taken.key}, requested ${key}`,
      );
      taken.owners++;
    } else {
      this.reserved.set(name, {
        texture: this.createTexture(desc, `reserved|${name}|${key}`),
        key,
        owners: 1,
        views: new Map(),
      });
    }
    return new ReservedTexture(name);
  }
  public static reservedTexture(name: string) {
    const reservation = this.reserved.get(name);
    assert(
      reservation !== undefined,
      `Texture "${name}" is not reserved (never reserved or already freed)`,
    );
    return reservation;
  }
  public static reservedView(name: string, mip?: number) {
    const reservation = this.reservedTexture(name);
    const slot = mip ?? -1;
    let view = reservation.views.get(slot);
    if (!view) {
      view = reservation.texture.createView({
        label: `reserved|${name}|mip:${mip ?? "all"}`,
        baseMipLevel: mip ?? 0,
        mipLevelCount: mip === undefined ? undefined : 1,
      });
      reservation.views.set(slot, view);
    }
    return view;
  }
  public static unreserve(name: string) {
    const reservation = this.reservedTexture(name);
    if (--reservation.owners > 0) return;
    reservation.texture.destroy();
    this.reserved.delete(name);
  }
  private static key(desc: TextureDescriptor) {
    const { width, height } = this.resolveSize(desc.size);
    return `${this.sizeBase(desc.size)}|${desc.format}|${width}|${height}|${desc.layers ?? 1}|${desc.mips ?? 1}|${desc.dimension ?? "2d"}`;
  }
  private static sizeBase(size: TextureSize) {
    return "scale" in size ? (size.base ?? "render") : "fixed";
  }
  public static resolveSize(size: TextureSize): Size2D {
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
    const dimension = desc.dimension ?? "2d";
    const largest =
      dimension === "3d"
        ? Math.max(size.width, size.height, desc.layers ?? 1)
        : Math.max(size.width, size.height);
    const maxMips = Math.floor(Math.log2(largest)) + 1;
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
      dimension,
      usage: this.textureUsage(desc.format, dimension),
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
  // every mip and layer as 2d-array, depth aspect only so depth can be read as float
  public static arrayView(tex: GPUTexture): GPUTextureView {
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
    let view = texViews.get(ARRAY_VIEW);
    if (!view) {
      view = tex.createView({
        label: `${key}|array`,
        dimension: "2d-array",
        aspect: DEPTH_FORMATS.has(tex.format) ? "depth-only" : "all",
      });
      texViews.set(ARRAY_VIEW, view);
    }
    return view;
  }
  public static clearAll() {
    this.texturesFree.forEach((list) =>
      list.forEach((texture) => texture.destroy()),
    );
    this.texturesUsed.forEach((name, texture) => texture.destroy());
    this.reserved.forEach((reservation) => reservation.texture.destroy());
    this.texturesFree.clear();
    this.texturesUsed.clear();
    this.views.clear();
    this.reserved.clear();
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

  private static textureUsage(
    format: GPUTextureFormat,
    dimension: GPUTextureDimension,
  ): GPUTextureUsageFlags {
    if (DEPTH_FORMATS.has(format))
      return (
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      );

    let usage =
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST;
    // 3d render targets need depthSlice support, nothing draws into one yet
    if (dimension === "2d") usage |= GPUTextureUsage.RENDER_ATTACHMENT;
    if (STORAGE_FORMATS.has(format)) usage |= GPUTextureUsage.STORAGE_BINDING;
    return usage;
  }
}

// the owner's handle: free() once in the owner's destroy(), other passes read the texture by name
export class ReservedTexture {
  public readonly name: string;
  private freed = false;

  constructor(name: string) {
    this.name = name;
  }
  public get getTexture() {
    return ResourcePool.reservedTexture(this.name).texture;
  }
  public view(mip?: number) {
    return ResourcePool.reservedView(this.name, mip);
  }
  public free() {
    if (this.freed) return;
    this.freed = true;
    ResourcePool.unreserve(this.name);
  }
}
