import { assert, loadImg } from "@axiom/utils";
import Aurora from "./core";

export type AssetName = "albedo" | "normal" | "height" | "ui";
export interface SetTexturesOptions {
  sources: TextureSource[];
  normalMaps: boolean;
  heightMaps: boolean;
}
export interface TextureSource {
  name: string;
  albedo: string;
  normal?: string;
  height?: string;
}
export interface UISource {
  name: string;
  url: string;
}

export interface AtlasPage {
  index: number;
  width: number;
  height: number;
  layerWidth: number;
  layerHeight: number;
}

const ALBEDO_FORMAT_LINEAR: GPUTextureFormat = "rgba8unorm-srgb";
const ALBEDO_FORMAT_GAMMA: GPUTextureFormat = "rgba8unorm";
const NORMAL_FORMAT: GPUTextureFormat = "rgba8unorm";
const HEIGHT_FORMAT: GPUTextureFormat = "r8unorm";
const ALBEDO_NEUTRAL = [255, 255, 255, 255];
const NORMAL_NEUTRAL = [128, 128, 255, 255];
const HEIGHT_NEUTRAL = [0];
const UI_FORMAT: GPUTextureFormat = "rgba8unorm";
const WORLD_ASSETS: AssetName[] = ["albedo", "normal", "height"];

export default class AssetManager {
  private static textures: Map<AssetName, GPUTexture> = new Map();
  private static views: Map<AssetName, GPUTextureView> = new Map();
  declare private static defaultPage: AtlasPage;
  declare private static uiDefaultPage: AtlasPage;
  private static uiPages: Map<string, AtlasPage> = new Map();
  private static uiWarned: Set<string> = new Set();
  private static pages: Map<string, AtlasPage> = new Map();
  private static warned: Set<string> = new Set();

  public static async setTextures({
    sources,
    normalMaps,
    heightMaps,
  }: SetTexturesOptions) {
    const names: Set<string> = new Set();
    for (const source of sources) {
      assert(
        !names.has(source.name),
        `Texture name "${source.name}" is used more than once`,
      );
      names.add(source.name);
    }

    const albedoBitmaps = await Promise.all(
      sources.map((source) => this.loadBitmap(source.albedo)),
    );
    const normalBitmaps = await Promise.all(
      sources.map((source) =>
        normalMaps ? this.loadBitmap(source.normal) : null,
      ),
    );
    const heightBitmaps = await Promise.all(
      sources.map((source) =>
        heightMaps ? this.loadBitmap(source.height) : null,
      ),
    );

    let layerWidth = 1;
    let layerHeight = 1;
    for (let i = 0; i < sources.length; i++) {
      const albedo = albedoBitmaps[i]!;
      const normal = normalBitmaps[i];
      const height = heightBitmaps[i];
      layerWidth = Math.max(layerWidth, albedo.width);
      layerHeight = Math.max(layerHeight, albedo.height);
      assert(
        !normal ||
          (normal.width === albedo.width && normal.height === albedo.height),
        `Normal map of "${sources[i].name}" has a different size than its albedo`,
      );
      assert(
        !height ||
          (height.width === albedo.width && height.height === albedo.height),
        `Height map of "${sources[i].name}" has a different size than its albedo`,
      );
    }

    const textures: Map<AssetName, GPUTexture> = new Map();
    const albedoArr = this.buildArray(
      "albedo",
      Aurora.isLinear ? ALBEDO_FORMAT_LINEAR : ALBEDO_FORMAT_GAMMA,
      ALBEDO_NEUTRAL,
      albedoBitmaps,
      layerWidth,
      layerHeight,
    );
    textures.set("albedo", albedoArr);
    if (normalMaps) {
      const normalArr = this.buildArray(
        "normal",
        NORMAL_FORMAT,
        NORMAL_NEUTRAL,
        normalBitmaps,
        layerWidth,
        layerHeight,
      );
      textures.set("normal", normalArr);
    }
    if (heightMaps) {
      const heightArr = this.buildArray(
        "height",
        HEIGHT_FORMAT,
        HEIGHT_NEUTRAL,
        heightBitmaps,
        layerWidth,
        layerHeight,
      );
      textures.set("height", heightArr);
    }

    const pages: Map<string, AtlasPage> = new Map();
    sources.forEach((source, i) => {
      pages.set(source.name, {
        index: i + 1,
        width: albedoBitmaps[i]!.width,
        height: albedoBitmaps[i]!.height,
        layerWidth,
        layerHeight,
      });
    });
    for (let i = 0; i < sources.length; i++) {
      albedoBitmaps[i]?.close();
      normalBitmaps[i]?.close();
      heightBitmaps[i]?.close();
    }

    for (const name of WORLD_ASSETS) {
      this.textures.get(name)?.destroy();
      this.textures.delete(name);
      this.views.delete(name);
    }
    textures.forEach((texture, name) => {
      this.textures.set(name, texture);
      this.views.set(
        name,
        texture.createView({
          label: `${name}ArrayView`,
          dimension: "2d-array",
        }),
      );
    });
    this.defaultPage = {
      index: 0,
      width: layerWidth,
      height: layerHeight,
      layerWidth,
      layerHeight,
    };
    this.pages = pages;
    this.warned.clear();
  }
  public static async setUITextures(sources: UISource[]) {
    const names: Set<string> = new Set();
    for (const source of sources) {
      assert(
        !names.has(source.name),
        `UI texture name "${source.name}" is used more than once`,
      );
      names.add(source.name);
    }

    const bitmaps = await Promise.all(
      sources.map((source) => this.loadBitmap(source.url)),
    );
    let layerWidth = 1;
    let layerHeight = 1;
    for (const bitmap of bitmaps) {
      layerWidth = Math.max(layerWidth, bitmap!.width);
      layerHeight = Math.max(layerHeight, bitmap!.height);
    }

    const texture = this.buildArray(
      "ui",
      UI_FORMAT,
      ALBEDO_NEUTRAL,
      bitmaps,
      layerWidth,
      layerHeight,
    );

    const pages: Map<string, AtlasPage> = new Map();
    sources.forEach((source, i) => {
      pages.set(source.name, {
        index: i + 1,
        width: bitmaps[i]!.width,
        height: bitmaps[i]!.height,
        layerWidth,
        layerHeight,
      });
      bitmaps[i]!.close();
    });

    this.textures.get("ui")?.destroy();
    this.textures.set("ui", texture);
    this.views.set(
      "ui",
      texture.createView({ label: "uiArrayView", dimension: "2d-array" }),
    );
    this.uiDefaultPage = {
      index: 0,
      width: layerWidth,
      height: layerHeight,
      layerWidth,
      layerHeight,
    };
    this.uiPages = pages;
    this.uiWarned.clear();
  }
  public static getTexture(name: string): AtlasPage {
    const page = this.pages.get(name);
    if (page) return page;
    if (!this.warned.has(name)) {
      console.warn(`Texture "${name}" not found, using default`);
      this.warned.add(name);
    }
    return this.defaultPage;
  }
  public static getUITexture(name: string): AtlasPage {
    const page = this.uiPages.get(name);
    if (page) return page;
    if (!this.uiWarned.has(name)) {
      console.warn(`UI texture "${name}" not found, using default`);
      this.uiWarned.add(name);
    }
    return this.uiDefaultPage;
  }

  public static getView(name: AssetName) {
    const view = this.views.get(name);
    assert(view !== undefined, `Asset "${name}" is disabled in config`);
    return view;
  }

  public static hasAsset(name: AssetName) {
    return this.views.has(name);
  }

  private static async loadBitmap(url?: string) {
    if (!url) return null;
    return createImageBitmap(await loadImg(url));
  }

  private static buildArray(
    name: AssetName,
    format: GPUTextureFormat,
    neutral: number[],
    bitmaps: (ImageBitmap | null)[],
    width: number,
    height: number,
  ) {
    const hasAny = bitmaps.some((bitmap) => bitmap !== null);
    const layers = hasAny ? bitmaps.length + 1 : 1;
    const texture = Aurora.device.createTexture({
      label: `${name}Array`,
      format,
      size: { width, height, depthOrArrayLayers: layers },
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const neutralLayer = new Uint8Array(width * height * neutral.length);
    for (let i = 0; i < neutralLayer.length; i += neutral.length) {
      neutralLayer.set(neutral, i);
    }

    for (let layer = 0; layer < layers; layer++) {
      const bitmap = layer === 0 ? null : bitmaps[layer - 1];
      if (bitmap) {
        Aurora.device.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture, origin: { x: 0, y: 0, z: layer } },
          { width: bitmap.width, height: bitmap.height },
        );
      } else {
        Aurora.device.queue.writeTexture(
          { texture, origin: { x: 0, y: 0, z: layer } },
          neutralLayer,
          { bytesPerRow: width * neutral.length },
          { width, height },
        );
      }
    }
    return texture;
  }
}
