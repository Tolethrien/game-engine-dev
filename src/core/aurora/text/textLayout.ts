import AssetManager from "../assetManager";
import Font, { FontData } from "./font";
import TextRun from "./textRun";

export const CHAR = Object.freeze({
  SPACE: 32,
  NEWLINE: 10,
  RETURN: 13,
  TAB: 9,
});

export default class TextLayout {
  private static measureCodes: number[] = [];

  public static glyph(font: FontData, code: number) {
    return font.glyphs.get(code) ?? font.resolve?.(code) ?? font.fallback;
  }

  public static advance(font: FontData, code: number) {
    const glyph = font.glyphs.get(code);
    if (glyph) return glyph.advance;
    return font.measure ? font.measure(code) : font.fallback.advance;
  }

  public static normalize(text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 0x7f) return text.normalize("NFC");
    }
    return text;
  }

  public static codes(text: string, out: number[]) {
    const source = this.normalize(text);
    out.length = 0;
    for (let i = 0; i < source.length; i++) {
      let code = source.codePointAt(i)!;
      if (code > 0xffff) i++;
      if (code === CHAR.RETURN) continue;
      // tab stops would need columns, until then a tab is one space
      if (code === CHAR.TAB) code = CHAR.SPACE;
      out.push(code);
    }
    return out;
  }

  public static layout(
    font: FontData,
    codes: readonly number[],
    size: number,
    letterSpacing: number,
    run: TextRun,
  ) {
    this.walk(font, codes, size, letterSpacing, run, run.size);
    return run;
  }

  public static measure(
    fontName: string,
    text: string,
    size?: number,
    letterSpacing = 0,
  ): Size2D {
    const font = AssetManager.getFont(fontName, size);
    return this.walk(
      font,
      this.codes(text, this.measureCodes),
      Font.drawSize(font, size),
      letterSpacing,
      null,
      { width: 0, height: 0 },
    );
  }

  private static walk(
    font: FontData,
    codes: readonly number[],
    size: number,
    letterSpacing: number,
    run: TextRun | null,
    out: Size2D,
  ) {
    const scale = size / font.size;
    run?.reset(scale);
    let pen = 0;
    let widest = 0;
    let line = 0;
    let lineStart = true;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === CHAR.NEWLINE) {
        if (pen > widest) widest = pen;
        pen = 0;
        line++;
        lineStart = true;
        continue;
      }
      if (!lineStart) pen += letterSpacing;
      lineStart = false;
      if (run && code !== CHAR.SPACE) {
        const baseline = (font.ascender + line * font.lineHeight) * scale;
        run.place(this.glyph(font, code), pen, baseline);
      }
      pen += this.advance(font, code) * scale;
    }
    out.width = Math.max(widest, pen);
    out.height = (line + 1) * font.lineHeight * scale;
    return out;
  }
}
