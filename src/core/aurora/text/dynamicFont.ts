import { DEFAULT_FALLBACK, EMPTY_GLYPH, FontData, Glyph } from "./font";
import GlyphAtlas from "./glyphAtlas";
import { GlyphField } from "./distanceField";
import FontCanvas from "./fontCanvas";
import KerningTable from "./kerning";

const FALLBACK_CODE = DEFAULT_FALLBACK.codePointAt(0)!;
const FIELD = { scale: 4, maxSide: 512 };

export default class DynamicFont implements FontData {
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
  private readonly kerningTable: KerningTable;
  private readonly kerningScale: number;
  private fallbackGlyph: Glyph | null = null;

  constructor(
    name: string,
    size: number,
    atlas: GlyphAtlas,
    kerningTable: KerningTable,
  ) {
    this.name = name;
    this.size = size;
    this.atlas = atlas;
    this.kerningTable = kerningTable;
    this.kerningScale = size / KerningTable.referenceSize;
    this.css = FontCanvas.font(name, size);

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

  public kerning(left: number, right: number) {
    return this.kerningTable.get(left, right) * this.kerningScale;
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
    const field = this.rasterField(
      char,
      padding + left,
      padding + up,
      width,
      height,
    );
    const stored = this.atlas.store(image.data, width, height, field);
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

  // a field measured on the 1x mask follows its pixel stairs, outlines and shadows show them
  private rasterField(
    char: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): GlyphField {
    // big glyphs need less help and would cost a lot of EDT
    const scale = Math.max(
      1,
      Math.min(
        FIELD.scale,
        Math.floor(FIELD.maxSide / Math.max(width, height)),
      ),
    );
    const fineWidth = width * scale;
    const fineHeight = height * scale;
    const context = this.scratch(fineWidth, fineHeight);
    context.clearRect(0, 0, fineWidth, fineHeight);
    // same origin as the 1x raster, so both share the letter geometry
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillText(char, x, y);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const data = context.getImageData(0, 0, fineWidth, fineHeight).data;
    return { data, scale };
  }

  private scratch(width: number, height: number) {
    return FontCanvas.scratch(this.css, width, height);
  }
}
