import {
  DEFAULT_FALLBACK,
  DynamicFontSource,
  EMPTY_GLYPH,
  FontData,
  Glyph,
} from "./font";
import GlyphAtlas from "./glyphAtlas";

const FALLBACK_CODE = DEFAULT_FALLBACK.codePointAt(0)!;

export default class DynamicFont implements FontData {
  private static canvas: OffscreenCanvas | null = null;
  private static context: OffscreenCanvasRenderingContext2D;

  public readonly name: string;
  public readonly type = "dynamic";
  public readonly size: number;
  public readonly lineHeight: number;
  public readonly ascender: number;
  public readonly descender: number;
  public readonly glyphs: Map<number, Glyph> = new Map();
  private readonly advances: Map<number, number> = new Map();
  private readonly css: string;
  private readonly atlas: GlyphAtlas;
  private fallbackGlyph: Glyph | null = null;

  public static async load(source: DynamicFontSource) {
    const face = new FontFace(this.family(source.name), `url(${source.url})`);
    await face.load();
    document.fonts.add(face);
  }

  public static family(name: string) {
    return `aurora-${name}`;
  }

  constructor(name: string, size: number, atlas: GlyphAtlas) {
    this.name = name;
    this.size = size;
    this.atlas = atlas;
    this.css = `${size}px "${DynamicFont.family(name)}"`;

    const metrics = this.scratch(1, 1).measureText("Hg");
    this.ascender = Math.ceil(metrics.fontBoundingBoxAscent);
    this.descender = Math.ceil(metrics.fontBoundingBoxDescent);
    this.lineHeight = this.ascender + this.descender;
  }

  public get fallback(): Glyph {
    this.fallbackGlyph ??=
      this.resolve(FALLBACK_CODE) ?? EMPTY_GLYPH(0, this.atlas.spread);
    return this.fallbackGlyph;
  }

  public measure(code: number) {
    const glyph = this.glyphs.get(code);
    if (glyph) return glyph.advance;
    let advance = this.advances.get(code);
    if (advance === undefined) {
      advance = this.scratch(1, 1).measureText(
        String.fromCodePoint(code),
      ).width;
      this.advances.set(code, advance);
    }
    return advance;
  }

  public resolve(code: number): Glyph | undefined {
    const char = String.fromCodePoint(code);
    const metrics = this.scratch(1, 1).measureText(char);
    const left = Math.ceil(metrics.actualBoundingBoxLeft);
    const up = Math.ceil(metrics.actualBoundingBoxAscent);
    const inkWidth = left + Math.ceil(metrics.actualBoundingBoxRight);
    const inkHeight = up + Math.ceil(metrics.actualBoundingBoxDescent);

    if (inkWidth <= 0 || inkHeight <= 0) {
      const glyph = EMPTY_GLYPH(metrics.width, this.atlas.spread);
      this.glyphs.set(code, glyph);
      return glyph;
    }

    const padding = this.atlas.padding;
    const width = inkWidth + padding * 2;
    const height = inkHeight + padding * 2;
    const context = this.scratch(width, height);
    context.clearRect(0, 0, width, height);
    context.fillText(char, padding + left, padding + up);
    const image = context.getImageData(0, 0, width, height);
    const stored = this.atlas.store(image.data, width, height);
    if (!stored) {
      // the atlas never frees space, so retrying every frame would only repeat the measuring
      if (code === FALLBACK_CODE) return undefined;
      const fallback = this.fallback;
      this.glyphs.set(code, fallback);
      return fallback;
    }

    const glyph: Glyph = {
      page: stored.page,
      uv: stored.uv,
      width,
      height,
      offsetX: -(padding + left),
      offsetY: -(padding + up),
      advance: metrics.width,
      field: "mask",
      range: this.atlas.spread,
    };
    this.glyphs.set(code, glyph);
    return glyph;
  }

  private scratch(width: number, height: number) {
    let canvas = DynamicFont.canvas;
    if (!canvas) {
      canvas = DynamicFont.canvas = new OffscreenCanvas(256, 256);
      DynamicFont.context = canvas.getContext("2d", {
        willReadFrequently: true,
      })!;
    }
    if (canvas.width < width || canvas.height < height) {
      canvas.width = Math.max(canvas.width, width);
      canvas.height = Math.max(canvas.height, height);
    }
    const context = DynamicFont.context;
    context.font = this.css;
    context.fillStyle = "white";
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    return context;
  }
}
