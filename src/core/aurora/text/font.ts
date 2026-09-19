import { assert } from "@axiom/utils";
import type GlyphAtlas from "./glyphAtlas";
import type { AtlasSlot } from "./glyphAtlas";

export interface Glyph {
  page: number;
  uv: [number, number, number, number];
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  advance: number;
  /** mask: coverage in alpha and distance in red, mtsdf: distances in all four channels */
  field: GlyphField;
  /** texels of the atlas the distance field reaches: spread for masks, distanceRange for mtsdf */
  range: number;
}
export type GlyphField = "mask" | "mtsdf";
export type FontType = "bitmap" | "dynamic" | "mtsdf";
export interface FontData {
  name: string;
  type: FontType;
  size: number;
  lineHeight: number;
  ascender: number;
  descender: number;
  glyphs: Map<number, Glyph>;
  fallback: Glyph;
  resolve?(code: number): Glyph | undefined;
  measure?(code: number): number;
}

export interface GridFontSource {
  name: string;
  type: "grid";
  url: string;
  cell: Size2D;
  chars: string;
  baseline: number;
  fallback?: string;
}
export interface DynamicFontSource {
  name: string;
  type: "dynamic";
  url: string;
  size?: number;
}
export interface MtsdfFontSource {
  name: string;
  type: "mtsdf";
  url: string;
  json: MtsdfJson;
  fallback?: string;
}
export interface MtsdfJson {
  atlas: { type: string; distanceRange: number; size: number; yOrigin: string };
  metrics: { lineHeight: number; ascender: number; descender: number };
  glyphs: {
    unicode: number;
    advance: number;
    planeBounds?: { left: number; top: number; right: number; bottom: number };
    atlasBounds?: { left: number; top: number; right: number; bottom: number };
  }[];
}
export type FontSource = GridFontSource | DynamicFontSource | MtsdfFontSource;

export const DEFAULT_FALLBACK = "*";
export const EMPTY_GLYPH = (advance: number, range: number): Glyph => ({
  page: 0,
  uv: [0, 0, 0, 0],
  width: 0,
  height: 0,
  offsetX: 0,
  offsetY: 0,
  advance,
  field: "mask",
  range,
});

export default class Font {
  public static drawSize(font: FontData, size?: number) {
    // getFont already rasterized a dynamic font at the requested size, it must not scale again
    return font.type === "dynamic" ? font.size : (size ?? font.size);
  }

  public static fromGrid(
    source: GridFontSource,
    image: ImageData,
    atlas: GlyphAtlas,
  ): FontData {
    const { cell, baseline } = source;
    const columns = Math.floor(image.width / cell.width);
    const chars = Array.from(source.chars.normalize("NFC"));
    assert(
      columns > 0 &&
        Math.ceil(chars.length / columns) * cell.height <= image.height,
      `Font "${source.name}" has more characters than cells in its image`,
    );

    const padding = atlas.padding;
    const width = cell.width + padding * 2;
    const height = cell.height + padding * 2;
    const glyphs: Map<number, Glyph> = new Map();
    chars.forEach((char, i) => {
      const cellX = (i % columns) * cell.width;
      const cellY = Math.floor(i / columns) * cell.height;
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < cell.height; y++) {
        for (let x = 0; x < cell.width; x++) {
          const from = ((cellY + y) * image.width + cellX + x) * 4;
          const to = ((y + padding) * width + x + padding) * 4;
          pixels[to + 3] = image.data[from + 3];
        }
      }
      const stored = atlas.store(pixels, width, height);
      if (!stored) return;
      glyphs.set(char.codePointAt(0)!, {
        page: stored.page,
        uv: stored.uv,
        width,
        height,
        offsetX: -padding,
        offsetY: -baseline - padding,
        advance: cell.width,
        field: "mask",
        range: atlas.spread,
      });
    });

    const fallbackChar = source.fallback ?? DEFAULT_FALLBACK;
    const fallback = glyphs.get(fallbackChar.codePointAt(0)!);
    assert(
      fallback !== undefined,
      `Font "${source.name}" has no fallback character "${fallbackChar}"`,
    );
    return {
      name: source.name,
      type: "bitmap",
      size: cell.height,
      lineHeight: cell.height,
      ascender: baseline,
      descender: cell.height - baseline,
      glyphs,
      fallback,
    };
  }

  public static fromMTSDF(
    source: MtsdfFontSource,
    slot: AtlasSlot,
    layerSize: Size2D,
  ): FontData {
    const { atlas, metrics } = source.json;
    assert(
      atlas.type === "mtsdf" && atlas.yOrigin === "top",
      `Font "${source.name}" must be built with -type mtsdf -yorigin top`,
    );

    const size = atlas.size;
    const glyphs: Map<number, Glyph> = new Map();
    for (const entry of source.json.glyphs) {
      const advance = entry.advance * size;
      const plane = entry.planeBounds;
      const bounds = entry.atlasBounds;
      if (!plane || !bounds) {
        glyphs.set(
          entry.unicode,
          EMPTY_GLYPH(advance, atlas.distanceRange / 2),
        );
        continue;
      }
      const width = bounds.right - bounds.left;
      const height = bounds.bottom - bounds.top;
      glyphs.set(entry.unicode, {
        page: slot.layer,
        uv: [
          (slot.x + bounds.left) / layerSize.width,
          (slot.y + bounds.top) / layerSize.height,
          width / layerSize.width,
          height / layerSize.height,
        ],
        width,
        height,
        offsetX: plane.left * size,
        offsetY: plane.top * size,
        advance,
        field: "mtsdf",
        range: atlas.distanceRange / 2,
      });
    }

    const fallbackChar = source.fallback ?? DEFAULT_FALLBACK;
    const fallback = glyphs.get(fallbackChar.codePointAt(0)!);
    assert(
      fallback !== undefined,
      `Font "${source.name}" has no fallback character "${fallbackChar}"`,
    );
    return {
      name: source.name,
      type: "mtsdf",
      size,
      lineHeight: metrics.lineHeight * size,
      ascender: -metrics.ascender * size,
      descender: metrics.descender * size,
      glyphs,
      fallback,
    };
  }
}
