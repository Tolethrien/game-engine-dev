import Draw from "@/core/aurora/draw";
import FontGen from "@/core/aurora/renderer/fontGen";
import Navi from "../navi";
import UINode, { NodeProps } from "../node";
import { Units } from "../units";
import { Style } from "../style";

//TODO: guiText dolicza to sztywno w trybie "pixel" — do usunięcia przy przebudowie Aurory
const AURORA_PIXEL_OFFSET = 8;

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
    return this.style.textSize * Navi.getScale + AURORA_PIXEL_OFFSET;
  }
  // string changed since lsat frame?
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

    const metrics = FontGen.measureText({
      fontName: this.style.textFont,
      fontSize: this.drawFontSize,
      text: this.lastText,
    });

    if (widthIsAuto) this.measured.width = metrics.width;
    if (heightIsAuto) this.measured.height = metrics.height;
  }

  public draw(box: Box) {
    super.draw(box);
    const scale = this.visualScale(box);
    const fontSize = this.style.textSize * Navi.getScale * scale.y;

    let x = box.x;
    if (this.style.textAlign !== "start") {
      const width = FontGen.measureText({
        fontName: this.style.textFont,
        fontSize: fontSize + AURORA_PIXEL_OFFSET,
        text: this.lastText,
      }).width;
      const free = box.w - width;
      x += this.style.textAlign === "center" ? free / 2 : free;
    }

    Draw.guiText({
      position: { x, y: box.y, mode: "pixel" },
      text: this.lastText,
      font: this.style.textFont,
      fontSize: { size: fontSize, mode: "pixel" },
      fontColor: this.paintTextColor,
    });
  }
}
