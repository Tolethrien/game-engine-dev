import { DrawGui as Draw } from "@aurora/urp/draw";
import TextLayout from "@aurora/text/textLayout";
import Navi from "../navi";
import UINode, { NodeProps } from "../node";
import { Units } from "../units";
import { Style } from "../style";

export default class UIText extends UINode {
  private lastText = "";

  constructor(
    private source: () => string,
    props: NodeProps = {},
  ) {
    super(props);
  }
  protected styleDefaults(): DeepPartial<Style> {
    return { backgroundColor: [0, 0, 0, 0] };
  }
  private get drawFontSize() {
    return this.style.textSize * Navi.getScale;
  }
  // string changed since last frame?
  public contentChanged() {
    const text = this.source();
    if (text === this.lastText) return false;
    this.lastText = text;
    return true;
  }

  public measureSelf(scale: number) {
    super.measureSelf(scale);

    const widthIsAuto = this.size.width.unit === Units.auto;
    const heightIsAuto = this.size.height.unit === Units.auto;
    if (!widthIsAuto && !heightIsAuto) return;

    const metrics = TextLayout.measure(
      this.style.textFont,
      this.lastText,
      this.drawFontSize,
    );

    if (widthIsAuto) this.measured.width = metrics.width;
    if (heightIsAuto) this.measured.height = metrics.height;
  }

  public draw(box: Box) {
    super.draw(box);
    const scale = this.visualScale(box);
    const fontSize = this.style.textSize * Navi.getScale * scale.y;

    let x = box.x;
    if (this.style.textAlign !== "start") {
      const width = TextLayout.measure(
        this.style.textFont,
        this.lastText,
        fontSize,
      ).width;
      const free = box.w - width;
      x += this.style.textAlign === "center" ? free / 2 : free;
    }

    Draw.text({
      ...this.paintTextStyle,
      position: { x, y: box.y, z: 0 },
      text: this.lastText,
      font: this.style.textFont,
      size: fontSize,
    });
  }
}
