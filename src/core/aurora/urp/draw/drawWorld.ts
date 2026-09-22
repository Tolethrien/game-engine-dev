import type { Bounds } from "@axiom/AABB";
import type Material from "@aurora/material";
import type { Glyph } from "@aurora/text/font";
import type TextBox from "@aurora/text/textBox";
import type WorldPass from "../passes/worldPass";
import { COLOR } from "@axiom/color";
import BaseDraw from "./baseDraw";
import type { WorldWriter } from "./drawInternal";
import type {
  Char,
  Circle,
  Ellipse,
  Line,
  Quad,
  Rect,
  Sprite,
  Text,
  TextBoxStyle,
} from "./drawTypes";

export class WorldDraw extends BaseDraw<WorldWriter> {
  // null until the pass is set up, drawing before that only warns
  private target: WorldPass | null = null;
  // sort point of a single shape, written from its bounds and the anchor
  private readonly shapeSort: Position3D = { x: 0, y: 0, z: 0 };
  private readonly textSortPoint: Position3D = { x: 0, y: 0, z: 0 };

  constructor() {
    super("Draw");
  }

  public setTarget(target: WorldPass) {
    this.target = target;
  }

  //SHAPES
  public rect(props: Rect) {
    const box = this.rectBox(props);
    const color = props.color ?? COLOR.WHITE;
    this.drawBox(box, props, color, props.position.z, props.sort);
  }
  public circle(props: Circle) {
    const box = this.circleBox(props);
    const color = props.color ?? COLOR.WHITE;
    this.drawBox(box, props, color, props.position.z, props.sort);
  }
  public ellipse(props: Ellipse) {
    this.drawEllipse(props, props.position.z, props.sort);
  }
  public line(props: Line) {
    this.drawLine(props, props.z, props.sort);
  }
  public sprite(props: Sprite) {
    const atlas = props.atlas ?? "world";
    const box = this.spriteBox(props, atlas);
    this.drawSprite(box, props, atlas, props.position.z, props.sort);
  }
  //MORFE
  public quad(props: Quad) {
    this.drawQuad(props, props.atlas ?? "world", props.z, props.sort);
  }
  //TEXT
  public text(props: Text) {
    this.drawText(props, props.position.z, props.sort, undefined);
  }
  public textBox(box: TextBox, props: TextBoxStyle) {
    this.drawTextBox(box, props, props.position.z, props.sort, undefined);
  }
  public glyph(props: Char) {
    return this.drawChar(props, props.position.z, props.sort, undefined);
  }

  protected get clipBuffer() {
    return this.target?.getClips ?? null;
  }
  protected pushInstance(material: Material, opaque: boolean) {
    return this.target?.push(opaque, material) ?? null;
  }
  protected place(
    view: WorldWriter,
    bounds: Bounds,
    z: number,
    sort: Position3D | undefined,
  ) {
    const target = this.target;
    if (!target) return;
    const point = sort ?? this.anchorPoint(target, bounds, z, this.shapeSort);
    view.sortPoint(point.x, point.y, point.z);
    target.trackSortPoint(point.x, point.y);
  }
  protected textSort(
    block: Bounds,
    z: number,
    sort: Position3D | undefined,
  ) {
    const target = this.target;
    if (sort || !target) return sort;
    return this.anchorPoint(target, block, z, this.textSortPoint);
  }
  protected acceptsGlyph(glyph: Glyph) {
    if (glyph.field === "mtsdf") return true;
    this.warnOnce(
      "font",
      "Draw: world text needs an mtsdf font, bitmap and dynamic fonts are for DrawGui only",
    );
    return false;
  }

  // x at the center of the bounds, y on the edge the sort config anchors to
  private anchorPoint(
    target: WorldPass,
    bounds: Bounds,
    z: number,
    out: Position3D,
  ) {
    out.x = (bounds.minX + bounds.maxX) / 2;
    out.z = z;
    switch (target.getSortAnchor) {
      case "top":
        out.y = bounds.minY;
        break;
      case "bottom":
        out.y = bounds.maxY;
        break;
      case "center":
        out.y = (bounds.minY + bounds.maxY) / 2;
        break;
    }
    return out;
  }
}

// the instance the world pass drives, games get it narrowed from draw.ts
export const worldDraw = new WorldDraw();
