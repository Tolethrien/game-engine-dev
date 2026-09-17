import { COLOR } from "@/core/axiom/color";
import AssetManager, { AtlasPage } from "../assetManager";
import Material from "../material";
import defaultMaterial from "./shaders/materials/default.wgsl?raw";
import type DrawPass from "./passes/draw";
import type { DrawWriter } from "./passes/draw";

export type CornerRadius = number | [number, number, number, number];
export interface DrawOutline {
  width: number;
  color: RGBA;
}
export type MaterialParams = [number, number, number, number];
export type DrawAtlas = "world" | "ui";

export const DEFAULT_MATERIAL = Material.create({
  name: "drawDefault",
  fragment: defaultMaterial,
});

export interface DrawStyle {
  color?: RGBA;
  outline?: DrawOutline;
  material?: Material;
  params?: MaterialParams;
}
export interface DrawRect extends DrawStyle {
  position: Position3D;
  size: Size2D;
  rotation?: number;
  rounded?: CornerRadius;
}
export interface DrawCircle extends DrawStyle {
  position: Position3D;
  radius: number;
}
export interface DrawEllipse extends DrawStyle {
  position: Position3D;
  size: Size2D;
  rotation?: number;
}
export type LineCap = "butt" | "round" | "square";
export interface DrawLine extends DrawStyle {
  from: Position2D;
  to: Position2D;
  /** sort only, does not move the line on screen */
  z: number;
  width: number;
  cap?: LineCap;
}
export interface DrawSprite extends DrawStyle {
  position: Position3D;
  texture: string;
  /** userTextures or userUI, defaults to the one of the facade */
  atlas?: DrawAtlas;
  size?: Size2D;
  crop?: Crop;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  rounded?: CornerRadius;
}
export interface DrawQuad extends DrawStyle {
  /** clockwise from top left, the texture corners follow this order */
  points: [Position2D, Position2D, Position2D, Position2D];
  /** sort only, does not move the quad on screen */
  z: number;
  texture?: string;
  /** userTextures or userUI, defaults to the one of the facade */
  atlas?: DrawAtlas;
  crop?: Crop;
}

// must match SHAPE_* in draw.wgsl
const SHAPE_BOX = 0;
const SHAPE_ELLIPSE = 1;
const SHAPE_QUAD = 2;
// must match UI_ATLAS in draw.wgsl, marks a layer of the ui texture array
const UI_ATLAS = 0x80000000;
const NO_PARAMS = Object.freeze([0, 0, 0, 0]) as MaterialParams;

export class DrawApi {
  private target: DrawPass | null = null;
  private warned = false;
  private readonly name: string;
  private readonly atlas: DrawAtlas;

  constructor(name: string, atlas: DrawAtlas) {
    this.name = name;
    this.atlas = atlas;
  }

  public setTarget(pass: DrawPass) {
    this.target = pass;
  }
  public clearTarget(pass: DrawPass) {
    if (this.target === pass) this.target = null;
  }
  public beginFrame() {
    this.target?.beginFrame();
  }

  public rect({
    position,
    size,
    color = COLOR.WHITE,
    rotation = 0,
    rounded = 0,
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
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
      material,
      params,
      position.z,
    );
  }

  public circle({
    position,
    radius,
    color = COLOR.WHITE,
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
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
      material,
      params,
      position.z,
    );
  }

  public ellipse({
    position,
    size,
    color = COLOR.WHITE,
    rotation = 0,
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
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
      material,
      params,
      position.z,
    );
  }

  public line({
    from,
    to,
    width,
    color = COLOR.WHITE,
    cap = "butt",
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
    z,
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
      material,
      params,
      z,
    );
  }

  public sprite({
    position,
    texture,
    atlas = this.atlas,
    size,
    crop,
    color = COLOR.WHITE,
    rotation = 0,
    flipX = false,
    flipY = false,
    rounded = 0,
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
  }: DrawSprite) {
    const page = this.page(texture, atlas);
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
      material,
      params,
      position.z,
    );
    if (!vert) return;
    this.writeTexture(
      vert,
      page,
      atlas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      flipX,
      flipY,
    );
  }

  public quad({
    points,
    z,
    texture,
    atlas = this.atlas,
    crop,
    color = COLOR.WHITE,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
  }: DrawQuad) {
    const pass = this.target;
    if (!pass) return this.warnNoTarget();
    if (color[3] === 0) return;
    const a = points[0];
    const b = points[1];
    const c = points[2];
    const d = points[3];

    const anchor = pass.sort.anchor;
    const sortX = (a.x + b.x + c.x + d.x) / 4;
    const sortY =
      anchor === "top"
        ? Math.min(a.y, b.y, c.y, d.y)
        : anchor === "bottom"
          ? Math.max(a.y, b.y, c.y, d.y)
          : (a.y + b.y + c.y + d.y) / 4;

    const vert = pass.instance(color[3] === 255, material, sortX, sortY, z);
    // quads pack their 4 points into position, size and radius
    vert.position(a.x, a.y);
    vert.size(b.x, b.y);
    vert.radius(c.x, c.y, d.x, d.y);
    vert.rotation(0);
    vert.outlineWidth(0);
    vert.color(color[0], color[1], color[2], color[3]);
    vert.outlineColor(color[0], color[1], color[2], color[3]);
    vert.shape(SHAPE_QUAD);
    vert.params(params[0], params[1], params[2], params[3]);

    if (!texture) {
      vert.uvRect(0, 0, 1, 1);
      vert.layer(0);
      return;
    }
    const page = this.page(texture, atlas);
    this.writeTexture(
      vert,
      page,
      atlas,
      crop?.x ?? 0,
      crop?.y ?? 0,
      crop?.width ?? page.width,
      crop?.height ?? page.height,
      false,
      false,
    );
  }

  private page(texture: string, atlas: DrawAtlas) {
    return atlas === "ui"
      ? AssetManager.getUITexture(texture)
      : AssetManager.getTexture(texture);
  }

  private writeTexture(
    vert: DrawWriter,
    page: AtlasPage,
    atlas: DrawAtlas,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number,
    flipX: boolean,
    flipY: boolean,
  ) {
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
    vert.layer(atlas === "ui" ? (page.index | UI_ATLAS) >>> 0 : page.index);
  }

  private instance(
    shape: number,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    rounded: CornerRadius,
    color: RGBA,
    outline: DrawOutline | undefined,
    material: Material,
    params: MaterialParams,
    z: number,
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

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const anchor = pass.sort.anchor;
    let sortY = centerY;
    if (anchor !== "center") {
      const extentY =
        (Math.abs(Math.sin(rotation)) * width +
          Math.abs(Math.cos(rotation)) * height) /
        2;
      sortY = anchor === "top" ? centerY - extentY : centerY + extentY;
    }

    const vert = pass.instance(color[3] === 255, material, centerX, sortY, z);
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
    vert.params(params[0], params[1], params[2], params[3]);
    return vert;
  }

  private warnNoTarget() {
    if (this.warned) return;
    this.warned = true;
    console.warn(`${this.name} called, but there is no pass for it in the preset`);
  }
}

/** world space, follows the camera, sorted by the URP sort config */
export const Draw = new DrawApi("Draw", "world");
/** screen space in canvas pixels, drawn in call order on top of the world */
export const DrawGui = new DrawApi("DrawGui", "ui");
