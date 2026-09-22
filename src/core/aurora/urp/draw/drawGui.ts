import type TextBox from "@aurora/text/textBox";
import type GuiPass from "../passes/guiPass";
import { COLOR } from "@axiom/color";
import BaseDraw, { BoxGeometry, visibleOutline } from "./baseDraw";
import { GuiShape, InstanceWriter, writeCorners } from "./drawInternal";
import { DEFAULT_MATERIAL } from "./materials";
import type { Bounds } from "@axiom/AABB";
import type {
  DrawBackdrop,
  DrawShadow,
  GuiChar,
  GuiCircle,
  GuiEllipse,
  GuiLine,
  GuiQuad,
  GuiRect,
  GuiSprite,
  GuiText,
  GuiTextBoxStyle,
  ShapeStyle,
} from "./drawTypes";

export class GuiDraw extends BaseDraw<InstanceWriter> {
  // null until the pass is set up, drawing before that only warns
  private target: GuiPass | null = null;
  private readonly effectStyle: ShapeStyle = {};

  constructor() {
    super("DrawGui");
  }

  public setTarget(target: GuiPass) {
    this.target = target;
  }

  //SHAPES
  // box effects in order: outer shadows, backdrop, the box itself (tinting the backdrop), inner shadows
  public rect(props: GuiRect) {
    const box = this.rectBox(props);
    this.writeShadows(props.shadow, box, props, false);
    this.writeBackdrop(props.backdrop, box, props);
    this.drawBox(box, props, props.color ?? COLOR.WHITE, 0, undefined);
    this.writeShadows(props.shadow, box, props, true);
  }
  public circle(props: GuiCircle) {
    const box = this.circleBox(props);
    this.writeShadows(props.shadow, box, props, false);
    this.writeBackdrop(props.backdrop, box, props);
    this.drawBox(box, props, props.color ?? COLOR.WHITE, 0, undefined);
    this.writeShadows(props.shadow, box, props, true);
  }
  public ellipse(props: GuiEllipse) {
    this.drawEllipse(props, 0, undefined);
  }
  public line(props: GuiLine) {
    this.drawLine(props, 0, undefined);
  }
  // the shadow of a sprite follows its box, not the alpha of its texture
  public sprite(props: GuiSprite) {
    const atlas = props.atlas ?? "ui";
    const box = this.spriteBox(props, atlas);
    this.writeShadows(props.shadow, box, props, false);
    this.writeBackdrop(props.backdrop, box, props);
    this.drawSprite(box, props, atlas, 0, undefined);
    this.writeShadows(props.shadow, box, props, true);
  }
  //MORFE
  public quad(props: GuiQuad) {
    this.drawQuad(props, props.atlas ?? "ui", 0, undefined);
  }
  //TEXT
  public text(props: GuiText) {
    this.drawText(props, 0, undefined, props.shadow);
  }
  public textBox(box: TextBox, props: GuiTextBoxStyle) {
    this.drawTextBox(box, props, 0, undefined, props.shadow);
  }
  public glyph(props: GuiChar) {
    return this.drawChar(props, 0, undefined, props.shadow);
  }

  protected get clipBuffer() {
    return this.target?.getClips ?? null;
  }
  // one buffer in call order: the material only splits draw calls, nothing is opaque
  protected pushInstance() {
    return this.target?.push() ?? null;
  }
  // gui draws in call order, it only records where it drew for the backdrops
  protected place(_view: InstanceWriter, bounds: Bounds) {
    this.target?.getBackdrops.mark(bounds);
  }
  protected textSort() {
    return undefined;
  }
  // bitmap and dynamic fonts are made for the gui, every field works here
  protected acceptsGlyph() {
    return true;
  }

  // the last shadow of a list is drawn first, so the first ends on top like in css
  private writeShadows(
    shadow: DrawShadow | DrawShadow[] | undefined,
    box: BoxGeometry,
    style: ShapeStyle,
    inset: boolean,
  ) {
    if (!shadow) return;
    if (!Array.isArray(shadow)) {
      this.writeShadow(shadow, box, style, inset);
      return;
    }
    for (let i = shadow.length - 1; i >= 0; i--) {
      this.writeShadow(shadow[i], box, style, inset);
    }
  }
  private writeShadow(
    shadow: DrawShadow,
    box: BoxGeometry,
    style: ShapeStyle,
    inset: boolean,
  ) {
    if ((shadow.inset ?? false) !== inset) return;
    const effect = this.effectOf(style);
    const blur = Math.max(shadow.blur ?? 0, 0);
    const spread = shadow.spread ?? 0;
    const offsetX = shadow.offset?.x ?? 0;
    const offsetY = shadow.offset?.y ?? 0;

    const bounds = this.boxBounds(box);
    if (!inset) {
      // the outer shadow reaches past its box: offset, spread and 3 sigma of blur
      const reach = Math.hypot(offsetX, offsetY) + Math.max(spread, 0) + 1.5 * blur;
      bounds.minX -= reach;
      bounds.minY -= reach;
      bounds.maxX += reach;
      bounds.maxY += reach;
    }
    const view = this.fillShape(effect, shadow.color, bounds, 0, undefined, false);
    if (!view) return;
    view.position(box.x, box.y);
    view.size(box.width, box.height);
    view.rotation(box.rotation);
    writeCorners(view, box.rounded);
    view.outlineWidth(blur);
    // inner shadows sit under the outline of the box, like the css padding box
    const boxOutline = inset ? this.outlineWidthOf(style, box) : 0;
    view.params(offsetX, offsetY, spread, boxOutline);
    view.shape(inset ? GuiShape.InnerShadow : GuiShape.Shadow);
  }
  private writeBackdrop(
    backdrop: DrawBackdrop | undefined,
    box: BoxGeometry,
    style: ShapeStyle,
  ) {
    const target = this.target;
    if (!backdrop || !target || backdrop.blur <= 0) return;
    const sigma = backdrop.blur;
    const bounds = this.boxBounds(box);
    // decided before the instance is written: its own mark must not count as gui under it
    const tracker = target.getBackdrops;
    const source = tracker.classify(bounds, sigma);
    const view = this.fillShape(
      this.effectOf(style),
      COLOR.WHITE,
      bounds,
      0,
      undefined,
      false,
    );
    if (!view) return;
    view.position(box.x, box.y);
    view.size(box.width, box.height);
    view.rotation(box.rotation);
    writeCorners(view, box.rounded);
    view.params(sigma, 0, 0, 0);
    view.shape(
      source === "scene" ? GuiShape.BackdropScene : GuiShape.Backdrop,
    );
    tracker.add(source, target.getLastIndex, bounds, sigma);
  }
  // same material keeps the batch, an additive pipeline would add the effect instead
  private effectOf(style: ShapeStyle) {
    const effect = this.effectStyle;
    effect.material =
      style.material?.blend === "additive" ? DEFAULT_MATERIAL : style.material;
    effect.params = style.params;
    effect.outline = undefined;
    return effect;
  }
  private outlineWidthOf(style: ShapeStyle, box: BoxGeometry) {
    const outline = visibleOutline(style.outline);
    return outline
      ? Math.min(outline.width, Math.min(box.width, box.height) / 2)
      : 0;
  }
}

// the instance the gui pass drives, games get it narrowed from draw.ts
export const guiDraw = new GuiDraw();
