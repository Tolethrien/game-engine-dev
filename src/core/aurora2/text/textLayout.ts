import AssetManager from "../assetManager";
import Font, { FontData, Glyph } from "./font";

export const SPACE = 32;
export const NEWLINE = 10;

/** called for every visible glyph, x is the pen from the line start in pixels */
export type PlaceGlyph = (glyph: Glyph, x: number, line: number) => void;

export default class TextLayout {
  /** dynamic fonts create the glyph here, on its first use */
  public static glyph(font: FontData, code: number) {
    return font.glyphs.get(code) ?? font.resolve?.(code) ?? font.fallback;
  }

  /** advance without creating the glyph */
  public static advance(font: FontData, code: number) {
    const glyph = font.glyphs.get(code);
    if (glyph) return glyph.advance;
    return font.measure ? font.measure(code) : font.fallback.advance;
  }

  // ascii is always normalized, skip the cost for plain text
  public static normalize(text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 0x7f) return text.normalize("NFC");
    }
    return text;
  }

  /** code points of the normalized text, written into out */
  public static codes(text: string, out: number[]) {
    const source = this.normalize(text);
    out.length = 0;
    for (let i = 0; i < source.length; i++) {
      const code = source.codePointAt(i)!;
      if (code > 0xffff) i++;
      out.push(code);
    }
    return out;
  }

  /**
   * no wrapping, "\n" starts a new line, returns the size in pixels.
   * index loop instead of for..of, which allocates a string per character
   */
  public static lines(
    font: FontData,
    text: string,
    size: number,
    place?: PlaceGlyph,
    letterSpacing = 0,
  ): Size2D {
    const scale = size / font.size;
    const source = this.normalize(text);
    let pen = 0;
    let widest = 0;
    let line = 0;
    let lineStart = true;
    for (let i = 0; i < source.length; i++) {
      const code = source.codePointAt(i)!;
      if (code > 0xffff) i++;
      if (code === NEWLINE) {
        if (pen > widest) widest = pen;
        pen = 0;
        line++;
        lineStart = true;
        continue;
      }
      // spacing goes between letters, not after the last one of a line
      if (!lineStart) pen += letterSpacing;
      lineStart = false;
      // space only moves the pen, no reason to draw an empty quad
      if (place && code !== SPACE) place(this.glyph(font, code), pen, line);
      pen += this.advance(font, code) * scale;
    }
    return {
      width: Math.max(widest, pen),
      height: (line + 1) * font.lineHeight * scale,
    };
  }

  public static measure(
    fontName: string,
    text: string,
    size?: number,
    letterSpacing = 0,
  ) {
    const font = AssetManager.getFont(fontName, size);
    return this.lines(
      font,
      text,
      Font.drawSize(font, size),
      undefined,
      letterSpacing,
    );
  }
}
