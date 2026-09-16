import { COLOR } from "@/core/axiom/color";
import AssetManager from "../assetManager";
import type DrawPass from "./passes/draw";
import type { DrawWriter } from "./passes/draw";

export type CornerRadius = number | [number, number, number, number];
export interface DrawOutline {
  width: number;
  color: RGBA;
}
export interface DrawRect {
  position: Position2D;
  size: Size2D;
  color?: RGBA;
  /** radians, clockwise, around the rect center */
  rotation?: number;
  /** pixels, single value or [topLeft, topRight, bottomRight, bottomLeft] */
  rounded?: CornerRadius;
  /** drawn inside the rect, size does not change */
  outline?: DrawOutline;
}
export interface DrawCircle {
  /** center of the circle */
  position: Position2D;
  radius: number;
  color?: RGBA;
  /** drawn inside the circle, radius does not change */
  outline?: DrawOutline;
}
export interface DrawEllipse {
  /** center of the ellipse */
  position: Position2D;
  /** full width and height */
  size: Size2D;
  color?: RGBA;
  /** radians, clockwise, around the center */
  rotation?: number;
  /** drawn inside the ellipse, size does not change */
  outline?: DrawOutline;
}
export type LineCap = "butt" | "round" | "square";
export interface DrawLine {
  from: Position2D;
  to: Position2D;
  /** thickness in pixels */
  width: number;
  color?: RGBA;
  /** butt ends exactly at the points, round and square extend by half the width */
  cap?: LineCap;
  /** drawn inside the line, thickness does not change */
  outline?: DrawOutline;
}
export interface DrawSprite {
  /** top left corner, like rect */
  position: Position2D;
  /** name from userTextures */
  texture: string;
  /** defaults to crop size */
  size?: Size2D;
  /** pixels in the source image, defaults to the whole image */
  crop?: Crop;
  /** multiplies the texture */
  color?: RGBA;
  /** radians, clockwise, around the center */
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** clips the sprite, same as rect */
  rounded?: CornerRadius;
  /** follows the sprite rect, not its transparent pixels */
  outline?: DrawOutline;
}

// must match SHAPE_* in draw.wgsl
const SHAPE_BOX = 0;
const SHAPE_ELLIPSE = 1;

export default class Draw {
  private static target: DrawPass | null = null;
  private static warned = false;

  public static setTarget(pass: DrawPass) {
    this.target = pass;
  }
  public static clearTarget(pass: DrawPass) {
    if (this.target === pass) this.target = null;
  }
  public static beginFrame() {
    this.target?.beginFrame();
  }

  public static rect({
    position,
    size,
    color = COLOR.WHITE,
    rotation = 0,
    rounded = 0,
    outline,
  }: DrawRect) {
    this.instance(
      SHAPE_BOX,
      position.x,
      position.y,
      size.width,
      size.height,
      rotation,
      rounded,
      color,
      outline,
    );
  }

  public static circle({
    position,
    radius,
    color = COLOR.WHITE,
    outline,
  }: DrawCircle) {
    const size = radius * 2;
    this.instance(
      SHAPE_BOX,
      position.x - radius,
      position.y - radius,
      size,
      size,
      0,
      radius,
      color,
      outline,
    );
  }

  public static ellipse({
    position,
    size,
    color = COLOR.WHITE,
    rotation = 0,
    outline,
  }: DrawEllipse) {
    this.instance(
      SHAPE_ELLIPSE,
      position.x - size.width / 2,
      position.y - size.height / 2,
      size.width,
      size.height,
      rotation,
      0,
      color,
      outline,
    );
  }

  public static line({
    from,
    to,
    width,
    color = COLOR.WHITE,
    cap = "butt",
    outline,
  }: DrawLine) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) + (cap === "butt" ? 0 : width);
    const centerX = (from.x + to.x) / 2;
    const centerY = (from.y + to.y) / 2;
    this.instance(
      SHAPE_BOX,
      centerX - length / 2,
      centerY - width / 2,
      length,
      width,
      Math.atan2(dy, dx),
      cap === "round" ? width / 2 : 0,
      color,
      outline,
    );
  }

  public static sprite({
    position,
    texture,
    size,
    crop,
    color = COLOR.WHITE,
    rotation = 0,
    flipX = false,
    flipY = false,
    rounded = 0,
    outline,
  }: DrawSprite) {
    const page = AssetManager.getTexture(texture);
    const cropX = crop?.x ?? 0;
    const cropY = crop?.y ?? 0;
    const cropWidth = crop?.width ?? page.width;
    const cropHeight = crop?.height ?? page.height;

    const vert = this.instance(
      SHAPE_BOX,
      position.x,
      position.y,
      size?.width ?? cropWidth,
      size?.height ?? cropHeight,
      rotation,
      rounded,
      color,
      outline,
    );
    if (!vert) return;

    let u = cropX / page.layerWidth;
    let v = cropY / page.layerHeight;
    let uWidth = cropWidth / page.layerWidth;
    let vHeight = cropHeight / page.layerHeight;
    if (flipX) {
      u += uWidth;
      uWidth = -uWidth;
    }
    if (flipY) {
      v += vHeight;
      vHeight = -vHeight;
    }
    vert.uvRect(u, v, uWidth, vHeight);
    vert.layer(page.index);
  }

  private static instance(
    shape: number,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    rounded: CornerRadius,
    color: RGBA,
    outline: DrawOutline | undefined,
  ): DrawWriter | null {
    const pass = this.target;
    if (!pass) {
      this.warnNoTarget();
      return null;
    }
    const outlineColor = outline?.color ?? color;
    const outlineWidth =
      outline && outline.width > 0 && outlineColor[3] > 0 ? outline.width : 0;
    if (color[3] === 0 && outlineWidth === 0) return null;
    if (width <= 0 || height <= 0) return null;

    // outline is layered over the fill, so only the fill decides
    const vert = pass.instance(color[3] === 255);
    const maxRadius = Math.min(width, height) / 2;
    vert.position(x, y);
    vert.size(width, height);
    vert.rotation(rotation);
    if (typeof rounded === "number") {
      const radius = Math.min(rounded, maxRadius);
      vert.radius(radius, radius, radius, radius);
    } else {
      vert.radius(
        Math.min(rounded[0], maxRadius),
        Math.min(rounded[1], maxRadius),
        Math.min(rounded[2], maxRadius),
        Math.min(rounded[3], maxRadius),
      );
    }
    vert.outlineWidth(Math.min(outlineWidth, maxRadius));
    vert.color(color[0], color[1], color[2], color[3]);
    vert.outlineColor(
      outlineColor[0],
      outlineColor[1],
      outlineColor[2],
      outlineColor[3],
    );
    vert.shape(shape);
    // untextured: layer 0 is plain white, sprite overrides both
    vert.uvRect(0, 0, 1, 1);
    vert.layer(0);

    // sort point: center, moved by half of the rotated height
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const anchor = pass.sort.anchor;
    if (anchor === "center") {
      vert.sortPoint(centerX, centerY);
    } else {
      const extentY =
        (Math.abs(Math.sin(rotation)) * width +
          Math.abs(Math.cos(rotation)) * height) /
        2;
      vert.sortPoint(
        centerX,
        anchor === "top" ? centerY - extentY : centerY + extentY,
      );
    }
    return vert;
  }

  private static warnNoTarget() {
    if (this.warned) return;
    this.warned = true;
    console.warn("Draw called, but there is no DrawPass in the preset");
  }
}
