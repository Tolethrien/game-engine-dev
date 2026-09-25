import { assert, loadImg } from "@axiom/utils";
import { debug } from "@debug";
import Aurora from "./core";
import Font, {
  DynamicFontSource,
  FontData,
  FontSource,
  GridFontSource,
} from "./text/font";
import DynamicFont from "./text/dynamicFont";
import FontCanvas from "./text/fontCanvas";
import KerningTable from "./text/kerning";
import GlyphAtlas from "./text/glyphAtlas";
import type { FontAtlasConfig } from "./config";
import fallbackFontUrl from "./assets/fallbackFont.png";

export type AssetName = "albedo" | "normal" | "height" | "ui" | "fonts";

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
export const ASSET_NAMES: readonly AssetName[] = [
  "albedo",
  "normal",
  "height",
  "ui",
  "fonts",
];
const FORMAT = {
  albedoLinear: "rgba8unorm-srgb",
  albedoGamma: "rgba8unorm",
  normal: "rgba8unorm",
  height: "r8unorm",
  ui: "rgba8unorm",
  // glyph coverage is plain data, srgb decoding would move the edges
  fonts: "rgba8unorm",
} satisfies Record<string, GPUTextureFormat>;
const NEUTRAL = {
  albedo: [255, 255, 255, 255],
  normal: [128, 128, 255, 255],
  height: [0],
  fonts: [0, 0, 0, 0],
};
const DYNAMIC_SIZE = 16;
const WORLD_ASSETS: AssetName[] = ["albedo", "normal", "height"];
export const DEFAULT_FONT_NAME = "default";
const BUILTIN_FONT: GridFontSource = {
  name: DEFAULT_FONT_NAME,
  type: "grid",
  url: fallbackFontUrl,
  cell: { width: 16, height: 30 },
  chars:
    Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") +
    "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ",
  baseline: 25,
};

export default class AssetManager {
  private static textures: Map<AssetName, GPUTexture> = new Map();
  private static views: Map<AssetName, GPUTextureView> = new Map();
  declare private static defaultPage: AtlasPage;
  declare private static uiDefaultPage: AtlasPage;
  private static uiPages: Map<string, AtlasPage> = new Map();
  private static pages: Map<string, AtlasPage> = new Map();
  private static fonts: Map<string, FontData> = new Map();
  // a reload starts a new set of keys, so a name missing again is reported again
  private static warnings = {
    texture: debug.log.scope("auroraAssets").once(),
    ui: debug.log.scope("auroraAssets").once(),
    font: debug.log.scope("auroraAssets").once(),
  };
  private static fontsVersion = 0;
  private static dynamicSources: Map<string, DynamicFontSource> = new Map();
  private static dynamicFonts: Map<string, Map<number, DynamicFont>> =
    new Map();
  private static kerningTables: Map<string, KerningTable> = new Map();
  declare private static glyphAtlas: GlyphAtlas;
  declare private static defaultFont: FontData;

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
      Aurora.isLinear ? FORMAT.albedoLinear : FORMAT.albedoGamma,
      NEUTRAL.albedo,
      albedoBitmaps,
      layerWidth,
      layerHeight,
    );
    textures.set("albedo", albedoArr);
    if (normalMaps) {
      const normalArr = this.buildArray(
        "normal",
        FORMAT.normal,
        NEUTRAL.normal,
        normalBitmaps,
        layerWidth,
        layerHeight,
      );
      textures.set("normal", normalArr);
    }
    if (heightMaps) {
      const heightArr = this.buildArray(
        "height",
        FORMAT.height,
        NEUTRAL.height,
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
    this.warnings.texture = debug.log.scope("auroraAssets").once();
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
      FORMAT.ui,
      NEUTRAL.albedo,
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
    this.warnings.ui = debug.log.scope("auroraAssets").once();
  }
  public static async setFonts(sources: FontSource[], atlas: FontAtlasConfig) {
    const names: Set<string> = new Set();
    for (const source of sources) {
      assert(
        source.name !== DEFAULT_FONT_NAME,
        `Font name "${DEFAULT_FONT_NAME}" is reserved for the built-in font`,
      );
      assert(
        !names.has(source.name),
        `Font name "${source.name}" is used more than once`,
      );
      names.add(source.name);
    }

    const allSources: FontSource[] = [BUILTIN_FONT, ...sources];
    const grids = allSources.filter((source) => source.type === "grid");
    const dynamics = allSources.filter((source) => source.type === "dynamic");
    const mtsdfs = allSources.filter((source) => source.type === "mtsdf");
    const [images, atlases] = await Promise.all([
      Promise.all(grids.map((source) => this.loadImageData(source.url))),
      Promise.all(mtsdfs.map((source) => this.loadRawBitmap(source.url))),
      Promise.all(dynamics.map((source) => FontCanvas.load(source))),
    ]);

    // every font lives in the glyph atlas pages, layer 0 stays empty
    const pages = atlas.pages;
    const texture = this.buildArray(
      "fonts",
      FORMAT.fonts,
      NEUTRAL.fonts,
      [],
      atlas.pageSize,
      atlas.pageSize,
      pages,
    );
    const glyphAtlas = new GlyphAtlas(
      texture,
      1,
      pages,
      atlas.pageSize,
      atlas.spread,
    );

    const fonts: Map<string, FontData> = new Map();
    grids.forEach((source, i) => {
      fonts.set(source.name, Font.fromGrid(source, images[i], glyphAtlas));
    });
    mtsdfs.forEach((source, i) => {
      const bitmap = atlases[i];
      const slot = glyphAtlas.storeBitmap(bitmap);
      assert(
        slot !== null,
        `Font "${source.name}" has a ${bitmap.width}x${bitmap.height} atlas that does not fit a page of ${atlas.pageSize}px`,
      );
      fonts.set(
        source.name,
        Font.fromMTSDF(source, slot, glyphAtlas.layerSize),
      );
      bitmap.close();
    });

    this.textures.get("fonts")?.destroy();
    this.textures.set("fonts", texture);
    this.views.set(
      "fonts",
      texture.createView({ label: "fontsArrayView", dimension: "2d-array" }),
    );
    this.fonts = fonts;
    this.warnings.font = debug.log.scope("auroraAssets").once();
    this.dynamicSources = new Map(
      dynamics.map((source) => [source.name, source]),
    );
    this.dynamicFonts.clear();
    // one table per family: every size of a dynamic font shares the measured pairs
    this.kerningTables = new Map(
      dynamics.map((source) => [source.name, new KerningTable(source.name)]),
    );
    this.glyphAtlas = glyphAtlas;
    this.defaultFont = fonts.get(DEFAULT_FONT_NAME)!;
    this.fontsVersion++;
  }
  /** changes whenever glyphs may have moved, text boxes lay out again */
  public static get getFontsVersion() {
    return this.fontsVersion;
  }
  /** size only matters for dynamic fonts, rounded to whole pixels */
  public static getFont(name: string, size?: number): FontData {
    const font = this.fonts.get(name);
    if (font) return font;

    const source = this.dynamicSources.get(name);
    if (source) {
      const pixels = Math.max(
        1,
        Math.round(size ?? source.size ?? DYNAMIC_SIZE),
      );
      let sizes = this.dynamicFonts.get(name);
      if (!sizes) this.dynamicFonts.set(name, (sizes = new Map()));
      let dynamic = sizes.get(pixels);
      if (!dynamic) {
        dynamic = new DynamicFont(
          name,
          pixels,
          this.glyphAtlas,
          this.kerningTables.get(name)!,
        );
        sizes.set(pixels, dynamic);
      }
      return dynamic;
    }

    this.warnings.font
      .once(name)
      .warn(`Font "${name}" not found, using default`);
    return this.defaultFont;
  }

  public static getTexture(name: string): AtlasPage {
    const page = this.pages.get(name);
    if (page) return page;
    this.warnings.texture
      .once(name)
      .warn(`Texture "${name}" not found, using default`);
    return this.defaultPage;
  }
  public static getUITexture(name: string): AtlasPage {
    const page = this.uiPages.get(name);
    if (page) return page;
    this.warnings.ui
      .once(name)
      .warn(`UI texture "${name}" not found, using default`);
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
  public static getAssetTexture(name: AssetName) {
    return this.textures.get(name);
  }

  private static async loadBitmap(url?: string) {
    if (!url) return null;
    return createImageBitmap(await loadImg(url));
  }

  /** straight from the file: distance fields must not be premultiplied or converted */
  private static async loadRawBitmap(url: string) {
    const blob = await (await fetch(url)).blob();
    return createImageBitmap(blob, {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
  }

  /** pixels on the cpu, for fonts copied cell by cell into the glyph atlas */
  private static async loadImageData(url: string) {
    const bitmap = (await this.loadBitmap(url))!;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }

  private static buildArray(
    name: AssetName,
    format: GPUTextureFormat,
    neutral: number[],
    bitmaps: (ImageBitmap | null)[],
    width: number,
    height: number,
    // neutral layers after the bitmaps, filled later (glyph atlas pages)
    extraLayers = 0,
  ) {
    const hasAny = bitmaps.some((bitmap) => bitmap !== null);
    const layers = (hasAny ? bitmaps.length + 1 : 1) + extraLayers;
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
