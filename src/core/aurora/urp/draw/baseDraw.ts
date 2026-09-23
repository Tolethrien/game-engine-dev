import { COLOR } from "@axiom/color";
import AABB, { Bounds } from "@axiom/AABB";
import AssetManager, { DEFAULT_FONT_NAME } from "@aurora/assetManager";
import Font, { Glyph } from "@aurora/text/font";
import TextLayout from "@aurora/text/textLayout";
import TextRun from "@aurora/text/textRun";
import type TextBox from "@aurora/text/textBox";
import type Material from "@aurora/material";
import ClipStack from "../clip/clipStack";
import type ClipBuffer from "../clip/clipBuffer";
import { DrawClip, packMaterialClip } from "../clip/clip";
import { DEFAULT_MATERIAL } from "./materials";
import {
  CornerRadius,
  DrawAtlas,
  GuiShape,
  InstanceWriter,
  Shape,
  clearShapeData,
  writeCorners,
  writeGlyphField,
  texturePage,
  writeQuadPoints,
  writeTexture,
} from "./drawInternal";
import type {
  CharBase,
  CircleBase,
  DrawShadow,
  EllipseBase,
  LineBase,
  MaterialParams,
  Outline,
  QuadBase,
  RectBase,
  ShapeStyle,
  SpriteBase,
  TextBase,
  TextBoxBase,
  TextStyleBase,
} from "./drawTypes";

// box of a rect, circle or sprite, computed once and shared with the gui effects around it
export interface BoxGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  rounded: CornerRadius;
}

export default abstract class BaseDraw<Writer extends InstanceWriter> {
  protected readonly name: string;
  protected readonly bounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  protected readonly box: BoxGeometry = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    rounded: 0,
  };
  private readonly clips: ClipStack;
  private readonly warned = new Set<string>();
  private readonly textScratch = {
    run: new TextRun(),
    source: null as string | null,
    codes: [] as number[],
    block: { minX: 0, minY: 0, maxX: 0, maxY: 0 } as Bounds,
    style: {} as ShapeStyle,
    outline: { width: 0, color: COLOR.WHITE } as Outline,
    color: COLOR.WHITE as Readonly<RGBA>,
    material: undefined as Material | undefined,
    params: undefined as MaterialParams | undefined,
    z: 0,
    sort: undefined as Position3D | undefined,
    uvBlock: null as Bounds | null,
  };

  constructor(name: string) {
    this.name = name;
    this.clips = new ClipStack(name);
  }

  public clearFrame() {
    this.clips.reset();
  }
  public pushClip(props: DrawClip) {
    const buffer = this.clipBuffer;
    if (!buffer) this.warnNoTarget();
    this.clips.push(props, buffer);
  }
  public popClip() {
    this.clips.pop();
  }

  protected abstract get clipBuffer(): ClipBuffer | null;
  protected abstract pushInstance(
    material: Material,
    opaque: boolean,
  ): Writer | null;
  protected abstract place(
    view: Writer,
    bounds: Bounds,
    z: number,
    sort: Position3D | undefined,
  ): void;
  protected abstract textSort(
    block: Bounds,
    z: number,
    sort: Position3D | undefined,
  ): Position3D | undefined;
  protected abstract acceptsGlyph(glyph: Glyph): boolean;

  //SHAPES
  protected rectBox(props: RectBase) {
    const box = this.box;
    box.x = props.position.x;
    box.y = props.position.y;
    box.width = props.size.width;
    box.height = props.size.height;
    box.rotation = props.rotation ?? 0;
    box.rounded = props.rounded ?? 0;
    return box;
  }
  protected circleBox(props: CircleBase) {
    const { position, radius } = props;
    const box = this.box;
    box.x = position.x - radius;
    box.y = position.y - radius;
    box.width = radius * 2;
    box.height = radius * 2;
    box.rotation = 0;
    box.rounded = radius;
    return box;
  }
  // without a size the sprite takes its crop, then the whole texture
  protected spriteBox(props: SpriteBase, atlas: DrawAtlas) {
    const { size, crop } = props;
    const box = this.box;
    box.x = props.position.x;
    box.y = props.position.y;
    if (size) {
      box.width = size.width;
      box.height = size.height;
    } else if (crop) {
      box.width = crop.width;
      box.height = crop.height;
    } else {
      const page = texturePage(props.texture, atlas);
      box.width = page.width;
      box.height = page.height;
    }
    box.rotation = props.rotation ?? 0;
    box.rounded = props.rounded ?? 0;
    return box;
  }
  protected boxBounds(box: BoxGeometry) {
    return AABB.rotatedBounds(
      this.bounds,
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width,
      box.height,
      box.rotation,
    );
  }
  protected drawBox(
    box: BoxGeometry,
    style: ShapeStyle,
    color: Readonly<RGBA>,
    z: number,
    sort: Position3D | undefined,
  ) {
    const view = this.fillShape(style, color, this.boxBounds(box), z, sort);
    if (!view) return null;
    view.position(box.x, box.y);
    view.size(box.width, box.height);
    view.rotation(box.rotation);
    writeCorners(view, box.rounded);
    view.shape(Shape.Box);
    return view;
  }
  protected drawSprite(
    box: BoxGeometry,
    props: SpriteBase,
    atlas: DrawAtlas,
    z: number,
    sort: Position3D | undefined,
  ) {
    const view = this.drawBox(box, props, props.tint ?? COLOR.WHITE, z, sort);
    if (!view) return;
    writeTexture(
      view,
      props.texture,
      props.crop,
      props.flipX,
      props.flipY,
      atlas,
    );
  }
  protected drawEllipse(
    props: EllipseBase,
    z: number,
    sort: Position3D | undefined,
  ) {
    const { position, size } = props;
    const rotation = props.rotation ?? 0;
    const bounds = AABB.rotatedBounds(
      this.bounds,
      position.x,
      position.y,
      size.width,
      size.height,
      rotation,
    );
    const color = props.color ?? COLOR.WHITE;
    const view = this.fillShape(props, color, bounds, z, sort);
    if (!view) return;
    view.position(position.x - size.width / 2, position.y - size.height / 2);
    view.size(size.width, size.height);
    view.rotation(rotation);
    view.shape(Shape.Ellipse);
  }
  protected drawLine(props: LineBase, z: number, sort: Position3D | undefined) {
    const { from, to, width, cap = "butt" } = props;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    // round and square caps reach half the width past both ends
    const length = Math.hypot(dx, dy) + (cap === "butt" ? 0 : width);
    const rotation = Math.atan2(dy, dx);
    const centerX = (from.x + to.x) / 2;
    const centerY = (from.y + to.y) / 2;
    const bounds = AABB.rotatedBounds(
      this.bounds,
      centerX,
      centerY,
      length,
      width,
      rotation,
    );
    const color = props.color ?? COLOR.WHITE;
    const view = this.fillShape(props, color, bounds, z, sort);
    if (!view) return;
    view.position(centerX - length / 2, centerY - width / 2);
    view.size(length, width);
    view.rotation(rotation);
    writeCorners(view, cap === "round" ? width / 2 : 0);
    view.shape(Shape.Box);
  }
  protected drawQuad(
    props: QuadBase,
    atlas: DrawAtlas,
    z: number,
    sort: Position3D | undefined,
  ) {
    const [a, b, c, d] = props.points;
    const bounds = this.bounds;
    bounds.minX = Math.min(a.x, b.x, c.x, d.x);
    bounds.maxX = Math.max(a.x, b.x, c.x, d.x);
    bounds.minY = Math.min(a.y, b.y, c.y, d.y);
    bounds.maxY = Math.max(a.y, b.y, c.y, d.y);
    // quad has no outline prop: its distance is approximate, a ring would wobble
    const view = this.fillShape(
      props,
      props.color ?? COLOR.WHITE,
      bounds,
      z,
      sort,
    );
    if (!view) return;
    writeQuadPoints(view, a, b, c, d);
    if (props.texture) {
      writeTexture(view, props.texture, props.crop, false, false, atlas);
    }
    view.shape(Shape.Quad);
  }

  //TEXT
  protected drawText(
    props: TextBase,
    z: number,
    sort: Position3D | undefined,
    shadow: DrawShadow | DrawShadow[] | undefined,
  ) {
    const font = AssetManager.getFont(
      props.font ?? DEFAULT_FONT_NAME,
      props.size,
    );
    const text = this.textScratch;
    if (text.source !== props.text) {
      TextLayout.codes(props.text, text.codes);
      text.source = props.text;
    }
    TextLayout.layout(
      font,
      text.codes,
      Font.drawSize(font, props.size),
      props.letterSpacing ?? 0,
      text.run,
      props.kerning ?? true,
    );
    this.drawRun(text.run, 1, props, z, sort, shadow);
  }
  protected drawTextBox(
    box: TextBox,
    props: TextBoxBase,
    z: number,
    sort: Position3D | undefined,
    shadow: DrawShadow | DrawShadow[] | undefined,
  ) {
    this.drawRun(box.getRun, props.scale ?? 1, props, z, sort, shadow);
  }
  protected drawChar(
    props: CharBase,
    z: number,
    sort: Position3D | undefined,
    shadow: DrawShadow | DrawShadow[] | undefined,
  ) {
    const font = AssetManager.getFont(
      props.font ?? DEFAULT_FONT_NAME,
      props.size,
    );
    const glyph = TextLayout.glyph(font, props.char.codePointAt(0) ?? 0);
    const scale = Font.drawSize(font, props.size) / font.size;
    const { position } = props;
    const left = position.x + glyph.offsetX * scale;
    const top = position.y + font.ascender * scale + glyph.offsetY * scale;
    const block = this.textScratch.block;
    block.minX = left;
    block.minY = top;
    block.maxX = left + glyph.width * scale;
    block.maxY = top + glyph.height * scale;
    this.beginRun(props, z, sort, null);

    const outline = visibleOutline(props.outline);
    if (Array.isArray(shadow)) {
      for (let i = shadow.length - 1; i >= 0; i--) {
        if (this.textShadowVisible(shadow[i])) {
          this.writeGlyph(glyph, left, top, scale, null, shadow[i]);
        }
      }
    } else if (shadow && this.textShadowVisible(shadow)) {
      this.writeGlyph(glyph, left, top, scale, null, shadow);
    }
    if (outline) this.writeGlyph(glyph, left, top, scale, outline, null);
    this.writeGlyph(glyph, left, top, scale, null, null);
    return glyph.advance * scale;
  }

  private drawRun(
    run: Readonly<TextRun>,
    scale: number,
    props: TextStyleBase,
    z: number,
    sort: Position3D | undefined,
    shadow: DrawShadow | DrawShadow[] | undefined,
  ) {
    const { position } = props;
    const block = this.textScratch.block;
    block.minX = position.x;
    block.minY = position.y;
    block.maxX = position.x + run.size.width * scale;
    block.maxY = position.y + run.size.height * scale;
    this.beginRun(props, z, sort, props.uvScope === "text" ? block : null);

    const outline = visibleOutline(props.outline);
    if (Array.isArray(shadow)) {
      for (let i = shadow.length - 1; i >= 0; i--) {
        if (this.textShadowVisible(shadow[i])) {
          this.runLayer(run, scale, position, null, shadow[i]);
        }
      }
    } else if (shadow && this.textShadowVisible(shadow)) {
      this.runLayer(run, scale, position, null, shadow);
    }
    if (outline) this.runLayer(run, scale, position, outline, null);
    this.runLayer(run, scale, position, null, null);
  }
  private beginRun(
    props: TextStyleBase,
    z: number,
    sort: Position3D | undefined,
    uvBlock: Bounds | null,
  ) {
    const text = this.textScratch;
    text.color = props.color ?? COLOR.WHITE;
    text.material = props.material;
    text.params = props.params;
    text.z = z;
    text.sort = this.textSort(text.block, z, sort);
    text.uvBlock = uvBlock;
  }
  private runLayer(
    run: Readonly<TextRun>,
    scale: number,
    position: Position2D,
    outline: Outline | null,
    shadow: DrawShadow | null,
  ) {
    const glyphScale = run.glyphScale * scale;
    const { glyphs, positions } = run;
    for (let i = 0; i < glyphs.length; i++) {
      this.writeGlyph(
        glyphs[i],
        position.x + positions[i * 2] * scale,
        position.y + positions[i * 2 + 1] * scale,
        glyphScale,
        outline,
        shadow,
      );
    }
  }
  private textShadowVisible(shadow: DrawShadow) {
    if (shadow.inset) {
      this.warnOnce(
        "textInset",
        `${this.name}: inset shadows are for boxes, text ignores them`,
      );
      return false;
    }
    return shadow.color[3] > 0;
  }
  private writeGlyph(
    glyph: Glyph,
    left: number,
    top: number,
    scale: number,
    outline: Outline | null,
    shadow: DrawShadow | null,
  ) {
    if (glyph.width === 0 || glyph.height === 0) return;
    if (!this.acceptsGlyph(glyph)) return;
    const text = this.textScratch;
    const mtsdf = glyph.field === "mtsdf";
    const style = text.style;
    style.material = text.material;
    style.params = text.params;
    style.outline = undefined;
    // scale is units per atlas texel, past the field's reach the distance saturates
    const limit = glyph.range * scale - 1;
    let color = text.color;
    let shape: number = mtsdf ? Shape.Mtsdf : GuiShape.Glyph;
    let x = left;
    let y = top;
    let blur = 0;
    let spread = 0;

    if (outline) {
      if (limit <= 0) return;
      if (outline.width > limit) {
        this.warnOnce(
          "textOutline",
          `${this.name}: text outline ${outline.width} is wider than the glyph distance field reaches (${limit.toFixed(1)}), clamped. Raise the font atlas spread or the mtsdf distanceRange`,
        );
      }
      text.outline.width = Math.min(outline.width, limit);
      text.outline.color = outline.color;
      style.outline = text.outline;
      color = outline.color;
      shape = mtsdf ? Shape.MtsdfOutline : GuiShape.GlyphOutline;
    } else if (shadow) {
      if (limit <= 0) return;
      blur = Math.max(shadow.blur ?? 0, 0);
      spread = shadow.spread ?? 0;
      if (Math.abs(spread) + blur > limit) {
        this.warnOnce(
          "textShadow",
          `${this.name}: text shadow spread + blur ${Math.abs(spread) + blur} is wider than the glyph distance field reaches (${limit.toFixed(1)}), blur reduced first`,
        );
        spread = Math.max(-limit, Math.min(spread, limit));
        blur = Math.max(0, Math.min(blur, limit - Math.abs(spread)));
      }
      x += shadow.offset?.x ?? 0;
      y += shadow.offset?.y ?? 0;
      color = shadow.color;
      shape = mtsdf ? GuiShape.MtsdfShadow : GuiShape.GlyphShadow;
      if (style.material?.blend === "additive")
        style.material = DEFAULT_MATERIAL;
    }

    const width = glyph.width * scale;
    const height = glyph.height * scale;
    const bounds = this.bounds;
    bounds.minX = x;
    bounds.minY = y;
    bounds.maxX = x + width;
    bounds.maxY = y + height;
    const view = this.fillShape(style, color, bounds, text.z, text.sort, false);
    if (!view) return;
    view.position(x, y);
    view.size(width, height);
    view.rotation(0);
    view.uvRect(glyph.uv[0], glyph.uv[1], glyph.uv[2], glyph.uv[3]);
    view.layer(glyph.page);
    const uvBlock = text.uvBlock;
    if (uvBlock) {
      const blockWidth = uvBlock.maxX - uvBlock.minX || 1;
      const blockHeight = uvBlock.maxY - uvBlock.minY || 1;
      writeGlyphField(
        view,
        glyph.range,
        (left - uvBlock.minX) / blockWidth,
        (top - uvBlock.minY) / blockHeight,
        width / blockWidth,
        height / blockHeight,
      );
    } else {
      writeGlyphField(view, glyph.range, 0, 0, 1, 1);
    }
    if (shadow) {
      view.outlineWidth(blur);
      view.params(spread, 0, 0, 0);
    }
    view.shape(shape);
  }

  protected fillShape(
    style: ShapeStyle,
    color: Readonly<RGBA>,
    bounds: Bounds,
    z: number,
    sort: Position3D | undefined,
    allowOpaque = true,
  ): Writer | null {
    const outline = visibleOutline(style.outline);
    if (color[3] === 0 && !outline) return null;
    if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return null;
    if (this.clips.culled(bounds)) return null;

    const material = style.material ?? DEFAULT_MATERIAL;
    const params = style.params ?? material.defaults;
    const view = this.pushInstance(material, allowOpaque && color[3] === 255);
    if (!view) {
      this.warnNoTarget();
      return null;
    }
    view.color(color[0], color[1], color[2], color[3]);
    if (outline) {
      const outlineColor = outline.color;
      view.outlineWidth(outline.width);
      view.outlineColor(
        outlineColor[0],
        outlineColor[1],
        outlineColor[2],
        outlineColor[3],
      );
    } else {
      view.outlineWidth(0);
      view.outlineColor(0, 0, 0, 0);
    }
    clearShapeData(view);
    // layer 0 of albedo is neutral white, so untextured shapes sample 1
    view.uvRect(0, 0, 1, 1);
    view.layer(0);
    view.params(params[0], params[1], params[2], params[3]);
    view.materialClip(packMaterialClip(material.id, this.clips.getCurrentId));
    this.place(view, bounds, z, sort);
    return view;
  }

  protected warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(message);
  }
  private warnNoTarget() {
    this.warnOnce(
      "target",
      `${this.name}: nothing to draw into yet, call it after URP.init and Aurora.build`,
    );
  }
}

export function visibleOutline(outline: Outline | undefined) {
  return outline && outline.width > 0 && outline.color[3] > 0 ? outline : null;
}
