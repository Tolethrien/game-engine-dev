import type { Glyph } from "./font";

export default class TextRun {
  public readonly glyphs: Glyph[] = [];
  // x, y of each glyph quad's top left corner, in pixels at glyphScale
  public readonly positions: number[] = [];
  public readonly size: Size2D = { width: 0, height: 0 };
  public glyphScale = 1;

  public reset(glyphScale: number) {
    this.glyphs.length = 0;
    this.positions.length = 0;
    this.glyphScale = glyphScale;
  }

  public place(glyph: Glyph, pen: number, baseline: number) {
    const scale = this.glyphScale;
    this.glyphs.push(glyph);
    this.positions.push(
      pen + glyph.offsetX * scale,
      baseline + glyph.offsetY * scale,
    );
    return glyph.advance * scale;
  }
}
