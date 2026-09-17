import AssetManager from "../assetManager";
import Font, { FontData, Glyph } from "./font";
import TextLayout, { NEWLINE, SPACE } from "./textLayout";

/** row: lines flow sideways and wrap on width, col: columns flow down and wrap on height */
export type TextDirection = "row" | "col";
/** along the flow: row horizontally, col vertically */
export type TextAlign = "start" | "center" | "end" | "justify";
/** the whole block across the flow: row vertically, col horizontally */
export type TextAlignCross = "start" | "center" | "end";
/** what happens when the text does not fit the limit across the flow */
export type TextOverflow = "visible" | "ellipsis" | "fit" | "tail";

export interface TextBoxOptions {
  font: string;
  text: string;
  /** pixels, defaults to the native font size */
  size?: number;
  direction: TextDirection;
  /** row: wraps lines, col: limits columns */
  width?: number;
  /** row: limits lines, col: wraps columns */
  height?: number;
  align: TextAlign;
  alignCross: TextAlignCross;
  /** row only: where the last line of a justified paragraph goes */
  justifyLast: TextAlignCross;
  /** pixels between lines (row) or columns (col), at the requested size */
  lineGap: number;
  /** row only: pixels added between letters at the requested size, negative packs them */
  letterSpacing: number;
  /** checked against the limits that are set, without them the text just grows */
  overflow: TextOverflow;
  /** false keeps every line whole, only "\n" breaks it: fit shrinks it, ellipsis cuts it */
  wrap: boolean;
  /** smallest size "fit" may shrink to */
  minSize: number;
}

const DEFAULTS: Omit<TextBoxOptions, "font"> = {
  text: "",
  direction: "row",
  align: "start",
  alignCross: "start",
  justifyLast: "start",
  lineGap: 0,
  letterSpacing: 0,
  overflow: "visible",
  minSize: 1,
  wrap: true,
};
const ELLIPSIS = [0x2026];
const DOTS = [46, 46, 46];
const FIT_STEPS = 10;

/**
 * Text laid out inside a box. Holds only what changes the layout and lays out
 * again lazily, after a change or when fonts are reloaded. Position, color and
 * scale come with every draw, so moving or animating it costs nothing.
 */
export default class TextBox {
  private options: TextBoxOptions;
  private dirty = true;
  private fontsVersion = -1;
  private codes: number[] = [];
  private codesText: string | null = null;

  // lines (row) or columns (col): code ranges, extent in pixels (row) or rows (col)
  private lineStart: number[] = [];
  private lineEnd: number[] = [];
  private lineExtent: number[] = [];
  private lineBreak: boolean[] = [];
  private lineEllipsis: boolean[] = [];
  private columnWidth = 0;

  private glyphs: Glyph[] = [];
  // top left corner of every glyph quad, x y pairs in box pixels
  private positions: number[] = [];
  private glyphScale = 1;
  private size: Size2D = { width: 0, height: 0 };

  constructor(options: Partial<TextBoxOptions> & { font: string }) {
    this.options = { ...DEFAULTS, ...options };
  }

  public set(options: Partial<TextBoxOptions>) {
    const current = this.options as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(options)) {
      if (current[key] === value) continue;
      current[key] = value;
      this.dirty = true;
    }
  }
  public get getOptions(): Readonly<TextBoxOptions> {
    return this.options;
  }
  /** limits where set, the laid out text on the free axes */
  public get getSize(): Readonly<Size2D> {
    this.update();
    return this.size;
  }
  public get getGlyphCount() {
    this.update();
    return this.glyphs.length;
  }
  /** multiplies glyph sizes, differs from the font when "fit" shrinks the text */
  public get getGlyphScale() {
    this.update();
    return this.glyphScale;
  }
  public getGlyph(index: number) {
    return this.glyphs[index];
  }
  public getX(index: number) {
    return this.positions[index * 2];
  }
  public getY(index: number) {
    return this.positions[index * 2 + 1];
  }

  private update() {
    const version = AssetManager.getFontsVersion;
    if (!this.dirty && version === this.fontsVersion) return;
    this.dirty = false;
    this.fontsVersion = version;

    const options = this.options;
    if (this.codesText !== options.text) {
      TextLayout.codes(options.text, this.codes);
      this.codesText = options.text;
    }

    let font = this.fontAt(options.size);
    const requested = Font.drawSize(font, options.size);
    let size = requested;
    this.wrap(font, size, requested);
    if (options.overflow === "fit" && !this.fits(font, size, requested)) {
      size = this.fitSize(font.type === "dynamic", requested);
      font = this.fontAt(size);
      size = Font.drawSize(font, size);
      this.wrap(font, size, requested);
    }
    this.limit(font, size, requested);
    this.place(font, size, requested);
  }

  /** dynamic fonts come per whole pixel size, others scale freely */
  private fontAt(size: number | undefined) {
    return AssetManager.getFont(this.options.font, size);
  }

  /** binary search for the largest size that still fits */
  private fitSize(wholePixels: boolean, requested: number) {
    const smallest = Math.min(this.options.minSize, requested);
    if (!wholePixels) {
      let low = smallest;
      let high = requested;
      for (let i = 0; i < FIT_STEPS; i++) {
        const middle = (low + high) / 2;
        const font = this.fontAt(middle);
        this.wrap(font, middle, requested);
        if (this.fits(font, middle, requested)) low = middle;
        else high = middle;
      }
      return low;
    }
    // every probed size is a font of its own, so probe whole pixels only
    let low = Math.max(1, Math.ceil(smallest));
    let high = requested - 1;
    let best = low;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const font = this.fontAt(middle);
      this.wrap(font, middle, requested);
      if (this.fits(font, middle, requested)) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return best;
  }

  //=============================== metrics

  private gap(size: number, requested: number) {
    return (this.options.lineGap * size) / requested;
  }
  private spacing(size: number, requested: number) {
    return (this.options.letterSpacing * size) / requested;
  }
  private step(font: FontData, size: number, requested: number) {
    return (font.lineHeight * size) / font.size + this.gap(size, requested);
  }
  private advance(font: FontData, code: number, scale: number) {
    return TextLayout.advance(font, code) * scale;
  }
  private ellipsisCodes(font: FontData) {
    // dynamic fonts can draw any character, the browser falls back for them
    if (font.type === "dynamic") return ELLIPSIS;
    return font.glyphs.has(ELLIPSIS[0]) ? ELLIPSIS : DOTS;
  }
  private isRow() {
    return this.options.direction === "row";
  }
  /** lines (row) or rows in a column (col) that fit the limit, Infinity without it */
  private capacity(limit: number | undefined, step: number, gap: number) {
    if (limit === undefined) return Infinity;
    return Math.max(1, Math.floor((limit + gap) / step));
  }

  //=============================== wrapping

  private wrap(font: FontData, size: number, requested: number) {
    this.lineStart.length = 0;
    this.lineEnd.length = 0;
    this.lineExtent.length = 0;
    this.lineBreak.length = 0;
    this.lineEllipsis.length = 0;

    const scale = size / font.size;
    if (this.isRow()) {
      const spacing = this.spacing(size, requested);
      this.wrapWords(
        this.options.wrap ? this.options.width : undefined,
        (code) => this.advance(font, code, scale) + spacing,
        spacing,
      );
      return;
    }
    // a column measures in rows, every character and every space takes one
    const rows = this.capacity(
      this.options.height,
      this.step(font, size, requested),
      this.gap(size, requested),
    );
    this.wrapWords(this.options.wrap ? rows : undefined, () => 1, 0);

    let widest = 0;
    for (const code of this.codes) {
      if (code === SPACE || code === NEWLINE) continue;
      widest = Math.max(widest, this.advance(font, code, scale));
    }
    this.columnWidth = widest;
  }

  /** greedy word wrap, a word longer than the limit stays whole and overflows */
  private wrapWords(
    limit: number | undefined,
    measure: (code: number) => number,
    // spacing measured after the last letter of a line, which is not there
    trailing: number,
  ) {
    const codes = this.codes;
    const count = codes.length;
    const space = measure(SPACE);
    let start = 0;
    let end = 0;
    let extent = 0;
    let hasWord = false;
    let i = 0;

    while (i <= count) {
      if (i === count || codes[i] === NEWLINE) {
        this.pushLine(
          start,
          hasWord ? end : start,
          hasWord ? extent - trailing : 0,
          true,
        );
        i++;
        start = i;
        extent = 0;
        hasWord = false;
        continue;
      }
      if (codes[i] === SPACE) {
        i++;
        continue;
      }

      const wordStart = i;
      let word = 0;
      while (i < count && codes[i] !== SPACE && codes[i] !== NEWLINE) {
        word += measure(codes[i]);
        i++;
      }
      if (!hasWord) {
        start = wordStart;
        end = i;
        extent = word;
        hasWord = true;
        continue;
      }
      const spaces = (wordStart - end) * space;
      if (limit !== undefined && extent + spaces + word > limit) {
        this.pushLine(start, end, extent - trailing, false);
        start = wordStart;
        extent = word;
      } else {
        extent += spaces + word;
      }
      end = i;
    }
  }

  private pushLine(
    start: number,
    end: number,
    extent: number,
    paragraphEnd: boolean,
  ) {
    this.lineStart.push(start);
    this.lineEnd.push(end);
    this.lineExtent.push(extent);
    this.lineBreak.push(paragraphEnd);
    this.lineEllipsis.push(false);
  }

  //=============================== overflow

  private fits(font: FontData, size: number, requested: number) {
    const { width, height } = this.options;
    const gap = this.gap(size, requested);
    const step = this.step(font, size, requested);
    const count = this.lineStart.length;
    let widest = 0;
    for (const extent of this.lineExtent) widest = Math.max(widest, extent);

    if (this.isRow()) {
      const blockHeight = count * step - gap;
      return (
        (height === undefined || blockHeight <= height) &&
        (width === undefined || widest <= width)
      );
    }
    const blockWidth = count * (this.columnWidth + gap) - gap;
    return (
      (width === undefined || blockWidth <= width) &&
      (height === undefined || widest * step - gap <= height)
    );
  }

  private limit(font: FontData, size: number, requested: number) {
    const { overflow, width, height, wrap } = this.options;
    if (overflow !== "ellipsis" && overflow !== "tail") return;

    const row = this.isRow();
    const gap = this.gap(size, requested);
    const step = this.step(font, size, requested);
    const max = row
      ? this.capacity(height, step, gap)
      : this.capacity(width, this.columnWidth + gap, gap);
    const count = this.lineStart.length;

    if (count > max && overflow === "tail") {
      const cut = count - max;
      this.lineStart.splice(0, cut);
      this.lineEnd.splice(0, cut);
      this.lineExtent.splice(0, cut);
      this.lineBreak.splice(0, cut);
      this.lineEllipsis.splice(0, cut);
    }
    if (overflow !== "ellipsis") return;

    const scale = size / font.size;
    const spacing = this.spacing(size, requested);
    const measure = row
      ? (code: number) => this.advance(font, code, scale) + spacing
      : () => 1;
    const lineLimit = row ? width : this.capacity(height, step, gap);
    let ellipsis = 0;
    for (const code of this.ellipsisCodes(font)) ellipsis += measure(code);

    if (count > max) {
      this.lineStart.length = max;
      this.lineEnd.length = max;
      this.lineExtent.length = max;
      this.lineBreak.length = max;
      this.lineEllipsis.length = max;
      this.trimLine(max - 1, lineLimit, ellipsis, measure);
    }
    // unwrapped lines can run past the limit on their own
    if (wrap || lineLimit === undefined) return;
    for (let line = 0; line < this.lineStart.length; line++) {
      if (this.lineEllipsis[line] || this.lineExtent[line] <= lineLimit)
        continue;
      this.trimLine(line, lineLimit, ellipsis, measure);
    }
  }

  /** cuts the line until the ellipsis fits after it */
  private trimLine(
    line: number,
    limit: number | undefined,
    ellipsis: number,
    measure: (code: number) => number,
  ) {
    const start = this.lineStart[line];
    let end = this.lineEnd[line];
    let extent = this.lineExtent[line];
    if (limit !== undefined) {
      while (end > start && extent + ellipsis > limit) {
        end--;
        extent -= measure(this.codes[end]);
      }
    }
    while (end > start && this.codes[end - 1] === SPACE) {
      end--;
      extent -= measure(SPACE);
    }
    this.lineEnd[line] = end;
    this.lineExtent[line] = extent + ellipsis;
    this.lineEllipsis[line] = true;
  }

  //=============================== placing

  private place(font: FontData, size: number, requested: number) {
    this.glyphs.length = 0;
    this.positions.length = 0;
    this.glyphScale = size / font.size;
    if (this.isRow()) this.placeRows(font, size, requested);
    else this.placeColumns(font, size, requested);
  }

  private offset(free: number, align: TextAlign | TextAlignCross) {
    if (align === "center") return free / 2;
    if (align === "end") return free;
    return 0;
  }

  private placeRows(font: FontData, size: number, requested: number) {
    const { width, height, align, alignCross, justifyLast } = this.options;
    const scale = this.glyphScale;
    const gap = this.gap(size, requested);
    const step = this.step(font, size, requested);
    // letter spacing goes after every character, spaces included
    const spacing = this.spacing(size, requested);
    const space = this.advance(font, SPACE, scale) + spacing;
    const count = this.lineStart.length;

    let widest = 0;
    for (const extent of this.lineExtent) widest = Math.max(widest, extent);
    const blockHeight = Math.max(0, count * step - gap);
    const boxWidth = width ?? widest;
    const boxHeight = height ?? blockHeight;
    const top = this.offset(boxHeight - blockHeight, alignCross);

    for (let line = 0; line < count; line++) {
      const start = this.lineStart[line];
      const end = this.lineEnd[line];
      const free = boxWidth - this.lineExtent[line];

      // justify stretches spaces, except the last line of a paragraph
      let extra = 0;
      let pen = this.offset(free, align);
      // the last line of a paragraph is not stretched, justifyLast places it
      if (align === "justify" && this.lineBreak[line]) {
        pen = this.offset(free, justifyLast);
      }
      if (align === "justify" && !this.lineBreak[line] && free > 0) {
        let spaces = 0;
        for (let i = start; i < end; i++) if (this.codes[i] === SPACE) spaces++;
        if (spaces > 0) extra = free / spaces;
      }

      const baseline = top + line * step + font.ascender * scale;
      for (let i = start; i < end; i++) {
        const code = this.codes[i];
        if (code === SPACE) {
          pen += space + extra;
          continue;
        }
        pen += this.pushGlyph(font, code, pen, baseline, scale) + spacing;
      }
      if (!this.lineEllipsis[line]) continue;
      for (const code of this.ellipsisCodes(font)) {
        pen += this.pushGlyph(font, code, pen, baseline, scale) + spacing;
      }
    }
    this.size.width = boxWidth;
    this.size.height = boxHeight;
  }

  private placeColumns(font: FontData, size: number, requested: number) {
    const { width, height, align, alignCross } = this.options;
    const scale = this.glyphScale;
    const gap = this.gap(size, requested);
    const step = this.step(font, size, requested);
    const columnStep = this.columnWidth + gap;
    const count = this.lineStart.length;

    let tallest = 0;
    for (const extent of this.lineExtent) tallest = Math.max(tallest, extent);
    const blockWidth = Math.max(0, count * columnStep - gap);
    const blockHeight = Math.max(0, tallest * step - gap);
    const boxWidth = width ?? blockWidth;
    const boxHeight = height ?? blockHeight;
    const left = this.offset(boxWidth - blockWidth, alignCross);

    for (let column = 0; column < count; column++) {
      const x = left + column * columnStep;
      const used = Math.max(0, this.lineExtent[column] * step - gap);
      const top = this.offset(boxHeight - used, align);
      let row = 0;
      const place = (code: number) => {
        // glyphs are centered in the column, narrow letters do not hug its left edge
        const glyph = TextLayout.glyph(font, code);
        const pen = x + (this.columnWidth - glyph.advance * scale) / 2;
        this.pushGlyph(
          font,
          code,
          pen,
          top + row * step + font.ascender * scale,
          scale,
        );
        row++;
      };

      for (let i = this.lineStart[column]; i < this.lineEnd[column]; i++) {
        if (this.codes[i] === SPACE) row++;
        else place(this.codes[i]);
      }
      if (this.lineEllipsis[column]) {
        for (const code of this.ellipsisCodes(font)) place(code);
      }
    }
    this.size.width = boxWidth;
    this.size.height = boxHeight;
  }

  /** returns the advance */
  private pushGlyph(
    font: FontData,
    code: number,
    pen: number,
    baseline: number,
    scale: number,
  ) {
    const glyph = TextLayout.glyph(font, code);
    this.glyphs.push(glyph);
    this.positions.push(
      pen + glyph.offsetX * scale,
      baseline + glyph.offsetY * scale,
    );
    return glyph.advance * scale;
  }
}
