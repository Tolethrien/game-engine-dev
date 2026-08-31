import Draw from "@/core/aurora/draw";
import FontGen from "@/core/aurora/renderer/fontGen";
import Navi from "../navi";
import UINode, { NodeProps } from "../node";
import { Units } from "../units";
import { Style } from "../style";

/** guiText adds this in "pixel" mode — drop it when Aurora gets rebuilt */
const AURORA_PIXEL_OFFSET = 8;

/**
 * A box with a declared size on one axis, in which the text wraps.
 * `direction` says which way the text flows:
 *   "row" — flows sideways, wraps onto new lines, height grows
 *   "col" — flows downwards, wraps onto new columns, width grows
 */
export default class UITextBox extends UINode {
  private lastText = "";
  private lines: string[] = [];
  private wrappedText = "";
  private wrappedExtent = -1;
  private columnWidth = 0;

  constructor(
    private source: () => string,
    props: NodeProps = {},
  ) {
    super(props);
  }
  protected styleDefaults(): DeepPartial<Style> {
    return { backgroundColor: [0, 0, 0, 0] };
  }
  //=============================== metrics

  private fontSize(scale: number) {
    return this.style.textSize * scale + AURORA_PIXEL_OFFSET;
  }

  /** in this font a line is exactly as tall as the font size */
  private lineHeight(scale: number) {
    return this.fontSize(scale);
  }

  private lineStep(scale: number) {
    return this.lineHeight(scale) + this.style.lineGap * scale;
  }

  private widthOf(text: string, scale: number) {
    return FontGen.measureText({
      fontName: this.style.textFont,
      fontSize: this.fontSize(scale),
      text,
    }).width;
  }

  private flowsSideways() {
    return this.style.direction === "row";
  }

  //=============================== data pull

  public contentChanged() {
    const text = this.source();
    if (text === this.lastText) return false;
    this.lastText = text;
    return true;
  }

  //=============================== layout

  public measureSelf(scale: number) {
    super.measureSelf(scale);

    const sideways = this.flowsSideways();
    const wrapUnit = sideways ? this.size.width : this.size.height;

    // a fixed extent can be wrapped right away; a percentage one waits for arrange
    if (wrapUnit.unit === Units.px) {
      this.wrap(wrapUnit.value * scale, scale);
    }

    const extent = this.linesExtent(scale);
    if (sideways) {
      if (this.size.height.unit === Units.auto) {
        this.measured.height = this.clampAxis(extent, "y", 0, 0, scale, false);
      }
      return;
    }
    if (this.size.width.unit === Units.auto) {
      this.measured.width = this.clampAxis(extent, "x", 0, 0, scale, false);
    }
  }

  public setBox(x: number, y: number, w: number, h: number) {
    super.setBox(x, y, w, h);

    const extent = this.flowsSideways() ? w : h;
    if (!this.needsWrap(extent)) return;

    this.wrap(extent, Navi.getScale);
    Navi.requestReflow();
  }

  private needsWrap(extent: number) {
    if (extent !== this.wrappedExtent) return true;
    return this.lastText !== this.wrappedText;
  }

  //=============================== wrapping

  private wrap(extent: number, scale: number) {
    this.wrappedExtent = extent;
    this.wrappedText = this.lastText;
    this.lines = [];

    if (this.flowsSideways()) this.wrapSideways(extent, scale);
    else this.wrapDownwards(extent, scale);
  }

  /** greedy word wrap against a width in pixels */
  private wrapSideways(maxWidth: number, scale: number) {
    const spaceWidth = this.widthOf(" ", scale);
    let line = "";
    let lineWidth = 0;

    for (const word of this.lastText.split(" ")) {
      const wordWidth = this.widthOf(word, scale);

      if (line.length === 0) {
        line = word;
        lineWidth = wordWidth;
        continue;
      }

      const grown = lineWidth + spaceWidth + wordWidth;
      if (grown > maxWidth) {
        this.lines.push(line);
        line = word;
        lineWidth = wordWidth;
        continue;
      }

      line = line + " " + word;
      lineWidth = grown;
    }

    if (line.length > 0) this.lines.push(line);
  }

  /** the same wrap, but counting rows instead of pixels — a word never splits */
  private wrapDownwards(maxHeight: number, scale: number) {
    const perColumn = Math.max(1, Math.floor(maxHeight / this.lineStep(scale)));
    let column = "";

    for (const word of this.lastText.split(" ")) {
      if (column.length === 0) {
        column = word;
        continue;
      }

      // +1 for the space, which takes a row of its own
      if (column.length + 1 + word.length > perColumn) {
        this.lines.push(column);
        column = word;
        continue;
      }

      column = column + " " + word;
    }

    if (column.length > 0) this.lines.push(column);
    this.columnWidth = this.widestGlyph(scale);
  }

  private widestGlyph(scale: number) {
    let widest = 0;
    for (const char of this.lastText) {
      const width = this.widthOf(char, scale);
      if (width > widest) widest = width;
    }
    return widest;
  }

  /** size taken on the free axis */
  private linesExtent(scale: number) {
    if (this.lines.length === 0) return 0;

    const gaps = this.style.lineGap * scale * (this.lines.length - 1);
    if (this.flowsSideways()) {
      return this.lines.length * this.lineHeight(scale) + gaps;
    }
    return this.lines.length * this.columnWidth + gaps;
  }

  //=============================== drawing

  public draw(box: Box) {
    super.draw(box);

    const visual = this.visualScale(box);
    const scale = Navi.getScale * visual.y;
    const color = this.paintTextColor;

    if (this.flowsSideways()) this.drawSideways(box.x, box.y, scale, color);
    else this.drawDownwards(box.x, box.y, scale, color, visual.x);
  }

  private drawSideways(x: number, y: number, scale: number, color: RGBA) {
    const step = this.lineStep(scale);

    for (let i = 0; i < this.lines.length; i++) {
      Draw.guiText({
        position: { x, y: y + i * step, mode: "pixel" },
        text: this.lines[i],
        font: this.style.textFont,
        fontSize: { size: this.style.textSize * scale, mode: "pixel" },
        fontColor: color,
      });
    }
  }

  /** one call per glyph — guiText lays a string out sideways and cannot be turned */
  private drawDownwards(
    x: number,
    y: number,
    scale: number,
    color: RGBA,
    stretchX: number,
  ) {
    const step = this.lineStep(scale);
    const columnStep =
      (this.columnWidth + this.style.lineGap * Navi.getScale) * stretchX;

    for (let col = 0; col < this.lines.length; col++) {
      const column = this.lines[col];
      let row = 0;

      for (const char of column) {
        Draw.guiText({
          position: {
            x: x + col * columnStep,
            y: y + row * step,
            mode: "pixel",
          },
          text: char,
          font: this.style.textFont,
          fontSize: { size: this.style.textSize * scale, mode: "pixel" },
          fontColor: color,
        });
        row++;
      }
    }
  }
}
