import { assert } from "@axiom/utils";
import type GlyphAtlas from "./glyphAtlas";
import type { AtlasSlot } from "./glyphAtlas";

export interface Glyph {
  /** layer in the font texture array */
  page: number;
  /** 0..1 in the layer: x, y, width, height */
  uv: [number, number, number, number];
  width: number;
  height: number;
  /** from the pen on the baseline to the top left corner of the glyph */
  offsetX: number;
  offsetY: number;
  advance: number;
  /** mask: coverage in alpha and distance in red, mtsdf: distances in all four channels */
  field: GlyphField;
  /** texels of the atlas the distance field reaches: spread for masks, distanceRange for mtsdf */
  range: number;
}
export type GlyphField = "mask" | "mtsdf";
/**
 * bitmap: fixed glyphs from an image, dynamic: rasterized on first use per size,
 * mtsdf: distance field atlas from msdf-atlas-gen, sharp at any scale
 */
export type FontType = "bitmap" | "dynamic" | "mtsdf";
export interface FontData {
  name: string;
  type: FontType;
  /** native size in pixels, glyphs are drawn 1:1 at this size */
  size: number;
  lineHeight: number;
  /** pixels above the baseline */
  ascender: number;
  /** pixels below the baseline */
  descender: number;
  glyphs: Map<number, Glyph>;
  /** drawn in place of characters the font does not have */
  fallback: Glyph;
  /** creates a glyph missing from glyphs, undefined when it cannot */
  resolve?(code: number): Glyph | undefined;
  /** advance without creating the glyph, layout measures far more than it draws */
  measure?(code: number): number;
}

/** hand drawn atlas: equal cells, filled left to right, top to bottom */
export interface GridFontSource {
  name: string;
  type: "grid";
  url: string;
  cell: Size2D;
  /** characters in cell order */
  chars: string;
  /** baseline in pixels from the top of a cell */
  baseline: number;
  /** defaults to "*" */
  fallback?: string;
}
/** ttf or otf rasterized by the browser, every whole pixel size gets its own glyphs */
export interface DynamicFontSource {
  name: string;
  type: "dynamic";
  url: string;
  /** used when a draw gives no size, defaults to 16 */
  size?: number;
}
/** atlas and json made by msdf-atlas-gen with -type mtsdf -yorigin top (buildFonts) */
export interface MtsdfFontSource {
  name: string;
  type: "mtsdf";
  /** the png */
  url: string;
  /** the json, imported as a module */
  json: MtsdfJson;
  /** defaults to "*" */
  fallback?: string;
}
/** the parts of the msdf-atlas-gen json Aurora reads */
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
/** a character that draws nothing, like a space */
export const EMPTY_GLYPH = (advance: number): Glyph => ({
  page: 0,
  uv: [0, 0, 0, 0],
  width: 0,
  height: 0,
  offsetX: 0,
  offsetY: 0,
  advance,
  field: "mask",
  range: 1,
});

export default class Font {
  /** the size glyphs are really drawn at: dynamic fonts round it to whole pixels */
  public static drawSize(font: FontData, size?: number) {
    return font.type === "dynamic" ? font.size : (size ?? font.size);
  }

  /**
   * every cell is copied into the glyph atlas with padding around it, grid
   * cells touch each other and would leave no room for outlines
   */
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
          // only the mask matters, the colour of hand drawn fonts is dropped
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

  /**
   * atlas from msdf-atlas-gen, copied into one place of the glyph atlas.
   * Metrics come in em, the atlas size says how many pixels an em is.
   */
  public static fromMtsdf(
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
      // spaces have no bounds, they only move the pen
      if (!plane || !bounds) {
        glyphs.set(entry.unicode, EMPTY_GLYPH(advance));
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
        // y grows down, so the top of a glyph above the baseline is negative
        offsetX: plane.left * size,
        offsetY: plane.top * size,
        advance,
        field: "mtsdf",
        // the json range is the whole span, the field reaches half of it each way
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
