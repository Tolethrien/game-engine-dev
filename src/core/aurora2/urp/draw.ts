import { COLOR } from "@/core/axiom/color";
import AssetManager, { AtlasPage } from "../assetManager";
import Font, { FontData, Glyph } from "../text/font";
import TextLayout from "../text/textLayout";
import type TextBox from "../text/textBox";
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
export type UvScope = "glyph" | "text";

export const DEFAULT_MATERIAL = Material.create({
  name: "drawDefault",
  fragment: defaultMaterial,
});

export interface DrawStyle {
  color?: RGBA;
  /** shapes: drawn inwards over the edge, text: grows outwards, up to fontAtlas.spread */
  outline?: DrawOutline;
  material?: Material;
  params?: MaterialParams;
  /**
   * sorts by this point instead of the one taken from the shape and the sort
   * anchor, e.g. feet under a tall sprite, or grid coordinates in isometry
   */
  sort?: Position3D;
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
export interface DrawGlyph extends DrawStyle {
  /** pen position on the baseline */
  position: Position3D;
  font: string;
  char: string;
  /** pixels, defaults to the native font size */
  size?: number;
}
export interface DrawText extends DrawStyle {
  /** top left corner of the text */
  position: Position3D;
  font: string;
  text: string;
  /** pixels, defaults to the native font size */
  size?: number;
  /** pixels added between letters, negative packs them */
  letterSpacing?: number;
  /** what the uv of the material spans: one letter (default) or the whole text */
  uvScope?: UvScope;
}
export interface DrawTextBox extends DrawStyle {
  /** top left corner of the box */
  position: Position3D;
  /** draw time transform (tweens), does not lay the text out again */
  scale?: number;
  /** what the uv of the material spans: one letter (default) or the whole text */
  uvScope?: UvScope;
}

// must match SHAPE_* in draw.wgsl
const SHAPE_BOX = 0;
const SHAPE_ELLIPSE = 1;
const SHAPE_QUAD = 2;
const SHAPE_GLYPH = 3;
const SHAPE_GLYPH_OUTLINE = 4;
const SHAPE_MTSDF = 5;
const SHAPE_MTSDF_OUTLINE = 6;
// must match UI_ATLAS in draw.wgsl, marks a layer of the ui texture array
const UI_ATLAS = 0x80000000;
const NO_PARAMS = Object.freeze([0, 0, 0, 0]) as MaterialParams;
const NO_OUTLINE_LAYERS: readonly null[] = [null];
// uv of a letter inside its text, two values packed into one float, 12 bits each
const UV_PACK = 4095;
const WHOLE_UV = UV_PACK + UV_PACK * 4096;
interface UvBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}
function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
function packUvSize(width: number, height: number) {
  return (
    Math.round(clamp01(width) * UV_PACK) +
    Math.round(clamp01(height) * UV_PACK) * 4096
  );
}

export class DrawApi {
  private target: DrawPass | null = null;
  private warned = false;
  // reused by blockSort, instances copy the values right away
  private textSortPoint: Position3D = { x: 0, y: 0, z: 0 };
  // reused by uvBlock, instances copy the values right away
  private textUvBlock: UvBlock = { x: 0, y: 0, width: 1, height: 1 };
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
    sort,
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
      sort,
    );
  }

  public circle({
    position,
    radius,
    color = COLOR.WHITE,
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
    sort,
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
      sort,
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
    sort,
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
      sort,
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
    sort,
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
      sort,
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
    sort,
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
      sort,
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
    sort,
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

    const vert = sort
      ? pass.instance(color[3] === 255, material, sort.x, sort.y, sort.z)
      : pass.instance(color[3] === 255, material, sortX, sortY, z);
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

  /** no state, no wrapping, "\n" starts a new line */
  public text({
    position,
    font: fontName,
    text,
    size,
    letterSpacing = 0,
    color = COLOR.WHITE,
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
    sort,
    uvScope = "glyph",
  }: DrawText) {
    const font = AssetManager.getFont(fontName, size);
    const textSize = Font.drawSize(font, size);
    const scale = textSize / font.size;
    const size2d = TextLayout.lines(font, text, textSize, undefined, letterSpacing);
    const point = sort ?? this.blockSort(position, size2d);
    const block = this.uvBlock(uvScope, position, size2d);
    // outlines of all letters first, so no outline covers a neighbouring letter
    for (const layer of this.textLayers(outline)) {
      TextLayout.lines(
        font,
        text,
        textSize,
        (glyph, x, line) => {
          const baseline =
            position.y + (font.ascender + line * font.lineHeight) * scale;
          this.writeGlyph(
            glyph,
            position.x + x + glyph.offsetX * scale,
            baseline + glyph.offsetY * scale,
            position.z,
            scale,
            color,
            layer,
            material,
            params,
            point,
            block,
          );
        },
        letterSpacing,
      );
    }
  }

  /** laid out text, the box lays out again only when it changed */
  public textBox(
    box: TextBox,
    {
      position,
      scale = 1,
      color = COLOR.WHITE,
      outline,
      material = DEFAULT_MATERIAL,
      params = NO_PARAMS,
      sort,
      uvScope = "glyph",
    }: DrawTextBox,
  ) {
    const count = box.getGlyphCount;
    const glyphScale = box.getGlyphScale * scale;
    const boxSize = box.getSize;
    const size2d = {
      width: boxSize.width * scale,
      height: boxSize.height * scale,
    };
    const point = sort ?? this.blockSort(position, size2d);
    const block = this.uvBlock(uvScope, position, size2d);
    for (const layer of this.textLayers(outline)) {
      for (let i = 0; i < count; i++) {
        this.writeGlyph(
          box.getGlyph(i),
          position.x + box.getX(i) * scale,
          position.y + box.getY(i) * scale,
          position.z,
          glyphScale,
          color,
          layer,
          material,
          params,
          point,
          block,
        );
      }
    }
  }

  /** single character, returns the advance in pixels */
  public glyph({
    position,
    font: fontName,
    char,
    size,
    color = COLOR.WHITE,
    outline,
    material = DEFAULT_MATERIAL,
    params = NO_PARAMS,
    sort,
  }: DrawGlyph) {
    const font: FontData = AssetManager.getFont(fontName, size);
    const glyph = TextLayout.glyph(font, char.codePointAt(0) ?? 0);
    const scale = Font.drawSize(font, size) / font.size;
    for (const layer of this.textLayers(outline)) {
      this.writeGlyph(
        glyph,
        position.x + glyph.offsetX * scale,
        position.y + glyph.offsetY * scale,
        position.z,
        scale,
        color,
        layer,
        material,
        params,
        sort,
        null,
      );
    }
    return glyph.advance * scale;
  }

  /** the text block a material uv spans, null when every letter spans its own */
  private uvBlock(scope: UvScope, position: Position3D, size: Size2D) {
    if (scope !== "text") return null;
    const block = this.textUvBlock;
    block.x = position.x;
    block.y = position.y;
    block.width = size.width || 1;
    block.height = size.height || 1;
    return block;
  }

  /** what a text draws: the outline layer only when it has a visible outline */
  private textLayers(outline: DrawOutline | undefined) {
    return outline && outline.width > 0 && outline.color[3] > 0
      ? [outline, null]
      : NO_OUTLINE_LAYERS;
  }

  /**
   * one sort point for a whole text, from its block and the sort anchor,
   * so objects never slip between letters or lines
   */
  private blockSort(position: Position3D, size: Size2D) {
    const anchor = this.target?.sort.anchor ?? "center";
    const point = this.textSortPoint;
    point.x = position.x + size.width / 2;
    point.y =
      anchor === "top"
        ? position.y
        : anchor === "bottom"
          ? position.y + size.height
          : position.y + size.height / 2;
    point.z = position.z;
    return point;
  }

  /** layer: the outline ring of the glyph, or null for its fill */
  private writeGlyph(
    glyph: Glyph,
    left: number,
    top: number,
    z: number,
    scale: number,
    color: RGBA,
    layer: DrawOutline | null,
    material: Material,
    params: MaterialParams,
    sort: Position3D | undefined,
    // set when the material uv should span the whole text instead of one letter
    block: UvBlock | null,
  ) {
    const msdf = glyph.field === "mtsdf";
    const shape = layer
      ? (msdf ? SHAPE_MTSDF_OUTLINE : SHAPE_GLYPH_OUTLINE)
      : (msdf ? SHAPE_MTSDF : SHAPE_GLYPH);
    const vert = this.instance(
      shape,
      left,
      top,
      glyph.width * scale,
      glyph.height * scale,
      0,
      0,
      // the ring alone decides if the outline layer is opaque
      layer ? layer.color : color,
      layer ?? undefined,
      material,
      params,
      z,
      sort,
    );
    if (!vert) return;
    vert.uvRect(glyph.uv[0], glyph.uv[1], glyph.uv[2], glyph.uv[3]);
    vert.layer(glyph.page);
    // glyphs have no rounded corners: radius carries the reach of their field
    // and where this letter sits in the text, see the packing note in todo.md
    if (!block) {
      vert.radius(glyph.range, 0, 0, WHOLE_UV);
      return;
    }
    vert.radius(
      glyph.range,
      clamp01((left - block.x) / block.width),
      clamp01((top - block.y) / block.height),
      packUvSize(
        (glyph.width * scale) / block.width,
        (glyph.height * scale) / block.height,
      ),
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
    sort: Position3D | undefined,
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

    let vert: DrawWriter;
    if (sort) {
      vert = pass.instance(color[3] === 255, material, sort.x, sort.y, sort.z);
    } else {
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
      vert = pass.instance(color[3] === 255, material, centerX, sortY, z);
    }
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
    console.warn(
      `${this.name} called, but there is no pass for it in the preset`,
    );
  }
}

/** world space, follows the camera, sorted by the URP sort config */
export const Draw = new DrawApi("Draw", "world");
/** screen space in canvas pixels, drawn in call order on top of the world */
export const DrawGui = new DrawApi("DrawGui", "ui");
