import { DrawGui as Draw } from "@aurora/urp/draw/draw";
import TextBox, { TextAlign, TextDirection } from "@aurora/text/textBox";
import Navi from "../navi";
import UINode, { NodeProps } from "../node";
import { Units } from "../units";
import { Style } from "../style";

export default class UITextBox extends UINode {
  private lastText = "";
  private box = new TextBox();

  constructor(
    private source: () => string,
    props: NodeProps = {},
  ) {
    super(props);
  }
  protected styleDefaults(): DeepPartial<Style> {
    return { backgroundColor: [0, 0, 0, 0] };
  }

  private fontSize(scale: number) {
    return this.style.textSize * scale;
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

    this.box.set({
      text: this.lastText,
      font: this.style.textFont,
      size: this.fontSize(scale),
      direction: this.style.direction as TextDirection,
      align: this.style.textAlign as TextAlign,
      lineGap: this.style.lineGap * scale,
    });

    const sideways = this.style.direction === "row";
    if (sideways) {
      if (this.size.width.unit === Units.px) {
        this.box.set({ width: this.size.width.value * scale });
      }
      if (this.size.height.unit === Units.auto) {
        this.measured.height = this.clampAxis(
          this.box.getSize.height,
          "y",
          0,
          0,
          scale,
          false,
        );
      }
      return;
    }
    if (this.size.height.unit === Units.px) {
      this.box.set({ height: this.size.height.value * scale });
    }
    if (this.size.width.unit === Units.auto) {
      this.measured.width = this.clampAxis(
        this.box.getSize.width,
        "x",
        0,
        0,
        scale,
        false,
      );
    }
  }

  public setBox(x: number, y: number, w: number, h: number) {
    super.setBox(x, y, w, h);

    // a fixed extent is already handled in measureSelf; this catches the
    // percentage case, where the pixel width/height is only known now
    const sideways = this.style.direction === "row";
    const extent = sideways ? w : h;
    const current = sideways
      ? this.box.getOptions.width
      : this.box.getOptions.height;
    if (extent === current) return;

    if (sideways) this.box.set({ width: extent });
    else this.box.set({ height: extent });
    Navi.requestReflow();
  }

  //=============================== drawing

  public draw(box: Box) {
    super.draw(box);

    Draw.textBox(this.box, {
      ...this.paintTextStyle,
      position: { x: box.x, y: box.y },
    });
  }
}
