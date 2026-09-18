import { COLOR } from "@/core/axiom/color";
import AssetManager, { AtlasPage, DEFAULT_FONT_NAME } from "../assetManager";
import Font, { FontData, Glyph } from "../text/font";
import TextLayout from "../text/textLayout";
import TextRun from "../text/textRun";
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
  outline?: DrawOutline;
  material?: Material;
  params?: MaterialParams;
  sort?: Position3D;
}
// like css box-shadow: blur is 2 sigma, spread grows the shape and its corners
export interface DrawShadow {
  color: RGBA;
  offset?: Position2D;
  blur?: number;
  spread?: number;
  inset?: boolean;
}
// first shadow of a list is on top, like in css
export interface DrawGuiExtra {
  shadow?: DrawShadow | DrawShadow[];
}
export interface DrawApiOptions {
  shadows?: boolean;
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
  z: number;
  width: number;
  cap?: LineCap;
}
export interface DrawSprite extends DrawStyle {
  position: Position3D;
  texture: string;
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
  atlas?: DrawAtlas;
  crop?: Crop;
}
export interface DrawGlyph extends DrawStyle {
  position: Position3D;
  font?: string;
  char: string;
  size?: number;
}
interface DrawTextStyle extends DrawStyle {
  position: Position3D;
  uvScope?: UvScope;
}
export interface DrawText extends DrawTextStyle {
  font?: string;
  text: string;
  size?: number;
  letterSpacing?: number;
}
export interface DrawTextBox extends DrawTextStyle {
  scale?: number;
}

// must match SHAPE_* in draw.wgsl
const SHAPE = Object.freeze({
  BOX: 0,
  ELLIPSE: 1,
  QUAD: 2,
  GLYPH: 3,
  GLYPH_OUTLINE: 4,
  MTSDF: 5,
  MTSDF_OUTLINE: 6,
  SHADOW: 7,
  INNER_SHADOW: 8,
  GLYPH_SHADOW: 9,
  MTSDF_SHADOW: 10,
});
// new glyph shapes must be added here, order of SHAPE no longer matters
const GLYPH_SHAPE_MASK =
  (1 << SHAPE.GLYPH) |
  (1 << SHAPE.GLYPH_OUTLINE) |
  (1 << SHAPE.MTSDF) |
  (1 << SHAPE.MTSDF_OUTLINE) |
  (1 << SHAPE.GLYPH_SHADOW) |
  (1 << SHAPE.MTSDF_SHADOW);
// never take the opaque path: antialiased or soft by nature
const TRANSPARENT_SHAPE_MASK =
  GLYPH_SHAPE_MASK | (1 << SHAPE.SHADOW) | (1 << SHAPE.INNER_SHADOW);

const UI_ATLAS = 0x80000000;
const NO_PARAMS = Object.freeze([0, 0, 0, 0]) as MaterialParams;
// glyph.radius packs the letter's uv-block size into 2x12 bit, see writeGlyph
const UV_PACK = Object.freeze({ step: 4095, base: 4096 });
const WHOLE_UV = UV_PACK.step + UV_PACK.step * UV_PACK.base;
interface UvBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}
function clampBinary(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
function packUvSize(width: number, height: number) {
  return (
    Math.round(clampBinary(width) * UV_PACK.step) +
    Math.round(clampBinary(height) * UV_PACK.step) * UV_PACK.base
  );
}

interface TextLayer {
  kind: "fill" | "outline" | "shadow";
  outline: DrawOutline | null;
  shadow: DrawShadow | null;
}
interface ShadowBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z: number;
  rounded: CornerRadius;
  maxRadius: number;
}

export class DrawApi<Extra extends object = {}> {
  private target: DrawPass | null = null;
  private warned = {
    target: false,
    outline: false,
    isoSort: false,
    textShadow: false,
    textInset: false,
  };
  private textSortPoint: Position3D = { x: 0, y: 0, z: 0 };
  private shapeSortPoint: Position3D = { x: 0, y: 0, z: 0 };
  private textUvBlock: UvBlock = { x: 0, y: 0, width: 1, height: 1 };
  private textBlockSize: Size2D = { width: 0, height: 0 };
  private glyphStyle: DrawStyle = {};
  private glyphOutline: DrawOutline = { width: 0, color: COLOR.WHITE };
  // one entry is enough for static labels, they stop normalizing every frame
  private textCodes = { source: null as string | null, codes: [] as number[] };
  private textRun = new TextRun();
  private textLayerList = { layers: [] as TextLayer[], pool: [] as TextLayer[] };
  private shadowStyle: DrawStyle = {};
  private shadowBox: ShadowBox = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    z: 0,
    rounded: 0,
    maxRadius: 0,
  };
  private readonly name: string;
  private readonly atlas: DrawAtlas;
  private readonly shadows: boolean;

  constructor(
    name: string,
    atlas: DrawAtlas,
    { shadows = false }: DrawApiOptions = {},
  ) {
    this.name = name;
    this.atlas = atlas;
    this.shadows = shadows;
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

  public rect(props: DrawRect & Extra) {
    const { position, size, rotation = 0, rounded = 0 } = props;
    const maxRadius = Math.min(size.width, size.height) / 2;
    const box = this.boxShadows(
      props,
      position.x,
      position.y,
      size.width,
      size.height,
      rotation,
      position.z,
      rounded,
      maxRadius,
    );
    const vert = this.instance(
      SHAPE.BOX,
      position.x,
      position.y,
      size.width,
      size.height,
      rotation,
      position.z,
      props,
    );
    if (vert) this.writeCorners(vert, rounded, maxRadius);
    if (box) this.writeShadows(props, box, true);
  }

  public circle(props: DrawCircle & Extra) {
    const { position, radius } = props;
    const size = radius * 2;
    const x = position.x - radius;
    const y = position.y - radius;
    const box = this.boxShadows(
      props,
      x,
      y,
      size,
      size,
      0,
      position.z,
      radius,
      radius,
    );
    const vert = this.instance(
      SHAPE.BOX,
      x,
      y,
      size,
      size,
      0,
      position.z,
      props,
    );
    if (vert) this.writeCorners(vert, radius, radius);
    if (box) this.writeShadows(props, box, true);
  }

  public ellipse(props: DrawEllipse) {
    const { position, size, rotation = 0 } = props;
    const vert = this.instance(
      SHAPE.ELLIPSE,
      position.x - size.width / 2,
      position.y - size.height / 2,
      size.width,
      size.height,
      rotation,
      position.z,
      props,
    );
    if (!vert) return;
    this.writeCorners(vert, 0, Math.min(size.width, size.height) / 2);
  }

  public line(props: DrawLine) {
    const { from, to, width, cap = "butt", z } = props;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) + (cap === "butt" ? 0 : width);
    const centerX = (from.x + to.x) / 2;
    const centerY = (from.y + to.y) / 2;
    const vert = this.instance(
      SHAPE.BOX,
      centerX - length / 2,
      centerY - width / 2,
      length,
      width,
      Math.atan2(dy, dx),
      z,
      props,
    );
    if (!vert) return;
    this.writeCorners(
      vert,
      cap === "round" ? width / 2 : 0,
      Math.min(length, width) / 2,
    );
  }

  public sprite(props: DrawSprite & Extra) {
    const {
      position,
      texture,
      atlas = this.atlas,
      size,
      crop,
      rotation = 0,
      flipX = false,
      flipY = false,
      rounded = 0,
    } = props;
    const page = this.page(texture, atlas);
    const width = size?.width ?? crop?.width ?? page.width;
    const height = size?.height ?? crop?.height ?? page.height;
    const maxRadius = Math.min(width, height) / 2;

    // the shadow of a sprite is the shadow of its box, not of its texture alpha
    const box = this.boxShadows(
      props,
      position.x,
      position.y,
      width,
      height,
      rotation,
      position.z,
      rounded,
      maxRadius,
    );
    const vert = this.instance(
      SHAPE.BOX,
      position.x,
      position.y,
      width,
      height,
      rotation,
      position.z,
      props,
    );
    if (vert) {
      this.writeCorners(vert, rounded, maxRadius);
      this.writeTexture(vert, page, atlas, crop, flipX, flipY);
    }
    if (box) this.writeShadows(props, box, true);
  }

  public quad(props: DrawQuad) {
    const { points, z, texture, atlas = this.atlas, crop } = props;
    const pass = this.target;
    if (!pass) return this.warnNoTarget();
    const color = props.color ?? COLOR.WHITE;
    if (color[3] === 0) return;
    const material = props.material ?? DEFAULT_MATERIAL;
    const params = props.params ?? NO_PARAMS;
    const a = points[0];
    const b = points[1];
    const c = points[2];
    const d = points[3];

    const centerX = (a.x + b.x + c.x + d.x) / 4;
    const minY = Math.min(a.y, b.y, c.y, d.y);
    const maxY = Math.max(a.y, b.y, c.y, d.y);
    if (!props.sort && pass.sort.mode === "gx+gy+z") this.warnIsoSort();
    // quad ignores outline: the SDF of an arbitrary quad gives no clean ring
    const point =
      props.sort ?? this.sortPoint(this.shapeSortPoint, centerX, minY, maxY, z);

    const vert = pass.instance(
      this.isOpaque(SHAPE.QUAD, color),
      material,
      point.x,
      point.y,
      point.z,
    );
    vert.position(a.x, a.y);
    vert.size(b.x, b.y);
    vert.radius(c.x, c.y, d.x, d.y);
    vert.rotation(0);
    this.writeStyle(vert, SHAPE.QUAD, color, color, 0, params);

    if (!texture) return;
    const page = this.page(texture, atlas);
    this.writeTexture(vert, page, atlas, crop, false, false);
  }

  public text(props: DrawText & Extra) {
    const {
      font: fontName = DEFAULT_FONT_NAME,
      text,
      size,
      letterSpacing = 0,
    } = props;
    const font = AssetManager.getFont(fontName, size);
    const cache = this.textCodes;
    if (cache.source !== text) {
      TextLayout.codes(text, cache.codes);
      cache.source = text;
    }
    TextLayout.layout(
      font,
      cache.codes,
      Font.drawSize(font, size),
      letterSpacing,
      this.textRun,
    );
    this.drawRun(this.textRun, 1, props);
  }

  public textBox(box: TextBox, props: DrawTextBox & Extra) {
    this.drawRun(box.getRun, props.scale ?? 1, props);
  }

  public glyph(props: DrawGlyph & Extra) {
    const {
      position,
      font: fontName = DEFAULT_FONT_NAME,
      char,
      size,
      color = COLOR.WHITE,
      outline,
      material = DEFAULT_MATERIAL,
      params = NO_PARAMS,
      sort,
    } = props;
    const font: FontData = AssetManager.getFont(fontName, size);
    const glyph = TextLayout.glyph(font, char.codePointAt(0) ?? 0);
    const scale = Font.drawSize(font, size) / font.size;
    const baseline = position.y + font.ascender * scale;
    const layers = this.textLayers(outline, (props as DrawGuiExtra).shadow);
    for (const layer of layers) {
      this.writeGlyph(
        glyph,
        position.x + glyph.offsetX * scale,
        baseline + glyph.offsetY * scale,
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

  private drawRun(
    run: Readonly<TextRun>,
    scale: number,
    props: DrawTextStyle,
  ) {
    const {
      position,
      color = COLOR.WHITE,
      outline,
      material = DEFAULT_MATERIAL,
      params = NO_PARAMS,
      sort,
      uvScope = "glyph",
    } = props;
    const blockSize = this.textBlockSize;
    blockSize.width = run.size.width * scale;
    blockSize.height = run.size.height * scale;
    if (!sort && this.target?.sort.mode === "gx+gy+z") this.warnIsoSort();
    const point = sort ?? this.blockSort(position, blockSize);
    const block = this.uvBlock(uvScope, position, blockSize);
    const glyphScale = run.glyphScale * scale;
    const { glyphs, positions } = run;
    // whole layers one after another: shadows, outlines, fills,
    // so nothing of one letter covers the layer above of its neighbour
    const layers = this.textLayers(outline, (props as DrawGuiExtra).shadow);
    for (const layer of layers) {
      for (let i = 0; i < glyphs.length; i++) {
        this.writeGlyph(
          glyphs[i],
          position.x + positions[i * 2] * scale,
          position.y + positions[i * 2 + 1] * scale,
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

  private uvBlock(scope: UvScope, position: Position3D, size: Size2D) {
    if (scope !== "text") return null;
    const block = this.textUvBlock;
    block.x = position.x;
    block.y = position.y;
    block.width = size.width || 1;
    block.height = size.height || 1;
    return block;
  }

  // pooled layer objects, text runs every frame and must not allocate
  private textLayers(
    outline: DrawOutline | undefined,
    shadow: DrawShadow | DrawShadow[] | undefined,
  ): readonly TextLayer[] {
    this.textLayerList.layers.length = 0;
    if (this.shadows && shadow) {
      if (!Array.isArray(shadow)) this.pushShadowLayer(shadow);
      else {
        for (let i = shadow.length - 1; i >= 0; i--) {
          this.pushShadowLayer(shadow[i]);
        }
      }
    }
    if (outline && outline.width > 0 && outline.color[3] > 0) {
      this.pushTextLayer("outline", outline, null);
    }
    this.pushTextLayer("fill", null, null);
    return this.textLayerList.layers;
  }

  private pushShadowLayer(shadow: DrawShadow) {
    if (shadow.inset) {
      this.warnTextInset();
      return;
    }
    if (shadow.color[3] > 0) this.pushTextLayer("shadow", null, shadow);
  }

  private pushTextLayer(
    kind: TextLayer["kind"],
    outline: DrawOutline | null,
    shadow: DrawShadow | null,
  ) {
    const { layers, pool } = this.textLayerList;
    let layer = pool[layers.length];
    if (!layer) {
      layer = { kind, outline, shadow };
      pool.push(layer);
    }
    layer.kind = kind;
    layer.outline = outline;
    layer.shadow = shadow;
    layers.push(layer);
  }

  private blockSort(position: Position3D, size: Size2D) {
    return this.sortPoint(
      this.textSortPoint,
      position.x + size.width / 2,
      position.y,
      position.y + size.height,
      position.z,
    );
  }

  private writeGlyph(
    glyph: Glyph,
    left: number,
    top: number,
    z: number,
    scale: number,
    color: RGBA,
    layer: TextLayer,
    material: Material,
    params: MaterialParams,
    sort: Position3D | undefined,
    block: UvBlock | null,
  ) {
    // scale is pixels per atlas texel (the shader's pixelsPerGlyphTexel),
    // past the field's range the distance saturates and fills the whole quad
    const limit = glyph.range * scale - 1;
    let outline: DrawOutline | undefined;
    if (layer.outline) {
      if (layer.outline.width > limit) {
        this.warnOutline(layer.outline.width, limit);
      }
      if (limit <= 0) return;
      outline = this.glyphOutline;
      outline.width = Math.min(layer.outline.width, limit);
      outline.color = layer.outline.color;
    }
    const shadow = layer.shadow;
    let x = left;
    let y = top;
    let blur = 0;
    let spread = 0;
    if (shadow) {
      if (limit <= 0) return;
      blur = shadow.blur ?? 0;
      spread = shadow.spread ?? 0;
      // blur gives way first, the spread keeps the shape of the shadow
      if (Math.abs(spread) + blur > limit) {
        this.warnTextShadow(Math.abs(spread) + blur, limit);
        spread = Math.max(-limit, Math.min(spread, limit));
        blur = Math.max(0, Math.min(blur, limit - Math.abs(spread)));
      }
      // offset moves the quad, so it costs nothing of the field's reach
      x += shadow.offset?.x ?? 0;
      y += shadow.offset?.y ?? 0;
    }

    const msdf = glyph.field === "mtsdf";
    const shape =
      layer.kind === "shadow"
        ? msdf
          ? SHAPE.MTSDF_SHADOW
          : SHAPE.GLYPH_SHADOW
        : layer.kind === "outline"
          ? msdf
            ? SHAPE.MTSDF_OUTLINE
            : SHAPE.GLYPH_OUTLINE
          : msdf
            ? SHAPE.MTSDF
            : SHAPE.GLYPH;
    const style = this.glyphStyle;
    style.color = layer.outline?.color ?? shadow?.color ?? color;
    style.outline = outline;
    // same material keeps the batch, an additive pipeline would add the shadow instead
    style.material =
      shadow && material.blend === "additive" ? DEFAULT_MATERIAL : material;
    style.params = params;
    style.sort = sort;
    const vert = this.instance(
      shape,
      x,
      y,
      glyph.width * scale,
      glyph.height * scale,
      0,
      z,
      style,
    );
    if (!vert) return;
    vert.uvRect(glyph.uv[0], glyph.uv[1], glyph.uv[2], glyph.uv[3]);
    vert.layer(glyph.page);
    if (shadow) {
      vert.outlineWidth(blur);
      vert.params(spread, 0, 0, 0);
    }
    if (!block) {
      vert.radius(glyph.range, 0, 0, WHOLE_UV);
      return;
    }
    vert.radius(
      glyph.range,
      clampBinary((left - block.x) / block.width),
      clampBinary((top - block.y) / block.height),
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
    crop: Crop | undefined,
    flipX: boolean,
    flipY: boolean,
  ) {
    const cropWidth = crop?.width ?? page.width;
    const cropHeight = crop?.height ?? page.height;
    let u = (crop?.x ?? 0) / page.layerWidth;
    let v = (crop?.y ?? 0) / page.layerHeight;
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

  private sortPoint(
    scratch: Position3D,
    centerX: number,
    minY: number,
    maxY: number,
    z: number,
  ) {
    const anchor = this.target?.sort.anchor ?? "center";
    scratch.x = centerX;
    scratch.y =
      anchor === "top" ? minY : anchor === "bottom" ? maxY : (minY + maxY) / 2;
    scratch.z = z;
    return scratch;
  }

  // outer shadows go under the box right away, the box is returned for the inner ones after it
  private boxShadows(
    props: DrawStyle,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    z: number,
    rounded: CornerRadius,
    maxRadius: number,
  ) {
    if (!this.shadows || !(props as DrawGuiExtra).shadow) return null;
    const box = this.shadowBox;
    box.x = x;
    box.y = y;
    box.width = width;
    box.height = height;
    box.rotation = rotation;
    box.z = z;
    box.rounded = rounded;
    box.maxRadius = maxRadius;
    this.writeShadows(props, box, false);
    return box;
  }

  private writeShadows(props: DrawStyle, box: ShadowBox, inset: boolean) {
    const shadow = (props as DrawGuiExtra).shadow!;
    if (!Array.isArray(shadow)) {
      this.writeShadow(props, box, shadow, inset);
      return;
    }
    for (let i = shadow.length - 1; i >= 0; i--) {
      this.writeShadow(props, box, shadow[i], inset);
    }
  }

  private writeShadow(
    props: DrawStyle,
    box: ShadowBox,
    shadow: DrawShadow,
    inset: boolean,
  ) {
    if ((shadow.inset ?? false) !== inset) return;
    const material = props.material ?? DEFAULT_MATERIAL;
    const style = this.shadowStyle;
    style.color = shadow.color;
    // same material keeps the batch, an additive pipeline would add the shadow instead
    style.material =
      material.blend === "additive" ? DEFAULT_MATERIAL : material;
    style.sort = props.sort;
    const vert = this.instance(
      inset ? SHAPE.INNER_SHADOW : SHAPE.SHADOW,
      box.x,
      box.y,
      box.width,
      box.height,
      box.rotation,
      box.z,
      style,
    );
    if (!vert) return;
    this.writeCorners(vert, box.rounded, box.maxRadius);
    // inner shadows sit under the outline of the box, like the css padding box
    const boxOutline = inset
      ? this.outlineWidth(props, box.width, box.height)
      : 0;
    vert.outlineWidth(shadow.blur ?? 0);
    vert.params(
      shadow.offset?.x ?? 0,
      shadow.offset?.y ?? 0,
      shadow.spread ?? 0,
      boxOutline,
    );
  }

  private writeCorners(
    vert: DrawWriter,
    rounded: CornerRadius,
    maxRadius: number,
  ) {
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
  }

  private isOpaque(shape: number, color: RGBA) {
    // an alpha test would tear antialiased glyph edges and soft shadows
    return color[3] === 255 && ((1 << shape) & TRANSPARENT_SHAPE_MASK) === 0;
  }

  private outlineWidth(style: DrawStyle, width: number, height: number) {
    const color = style.color ?? COLOR.WHITE;
    const outline = style.outline;
    const outlineColor = outline?.color ?? color;
    return outline && outline.width > 0 && outlineColor[3] > 0
      ? Math.min(outline.width, Math.min(width, height) / 2)
      : 0;
  }

  private writeStyle(
    vert: DrawWriter,
    shape: number,
    color: RGBA,
    outlineColor: RGBA,
    outlineWidth: number,
    params: MaterialParams,
  ) {
    vert.color(color[0], color[1], color[2], color[3]);
    vert.outlineColor(
      outlineColor[0],
      outlineColor[1],
      outlineColor[2],
      outlineColor[3],
    );
    vert.outlineWidth(outlineWidth);
    vert.shape(shape);
    // untextured: layer 0 is plain white, sprite/quad/glyph overwrite both
    vert.uvRect(0, 0, 1, 1);
    vert.layer(0);
    vert.params(params[0], params[1], params[2], params[3]);
  }

  private instance(
    shape: number,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
    z: number,
    style: DrawStyle,
  ): DrawWriter | null {
    const pass = this.target;
    if (!pass) {
      this.warnNoTarget();
      return null;
    }
    if (width <= 0 || height <= 0) return null;

    const color = style.color ?? COLOR.WHITE;
    const outline = style.outline;
    const outlineColor = outline?.color ?? color;
    // glyph outlines grow outwards and writeGlyph already limits them
    const maxOutline = this.isGlyphShape(shape)
      ? Infinity
      : Math.min(width, height) / 2;
    const outlineWidth =
      outline && outline.width > 0 && outlineColor[3] > 0
        ? Math.min(outline.width, maxOutline)
        : 0;
    if (color[3] === 0 && outlineWidth === 0) return null;

    const material = style.material ?? DEFAULT_MATERIAL;
    const params = style.params ?? NO_PARAMS;
    const opaque = this.isOpaque(shape, color);

    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const anchor = pass.sort.anchor;
    let point: Position3D;
    if (style.sort) {
      point = style.sort;
    } else {
      if (pass.sort.mode === "gx+gy+z") this.warnIsoSort();
      if (anchor === "center") {
        point = this.sortPoint(
          this.shapeSortPoint,
          centerX,
          centerY,
          centerY,
          z,
        );
      } else {
        const extentY =
          (Math.abs(Math.sin(rotation)) * width +
            Math.abs(Math.cos(rotation)) * height) /
          2;
        point = this.sortPoint(
          this.shapeSortPoint,
          centerX,
          centerY - extentY,
          centerY + extentY,
          z,
        );
      }
    }

    const vert = pass.instance(opaque, material, point.x, point.y, point.z);
    vert.position(x, y);
    vert.size(width, height);
    vert.rotation(rotation);
    this.writeStyle(vert, shape, color, outlineColor, outlineWidth, params);
    return vert;
  }

  private warnOutline(width: number, limit: number) {
    if (this.warned.outline) return;
    this.warned.outline = true;
    console.warn(
      `${this.name}: text outline ${width}px is wider than the glyph distance field reaches (${limit.toFixed(1)}px), clamped. Raise the font atlas spread or the mtsdf distanceRange`,
    );
  }

  private warnTextShadow(reach: number, limit: number) {
    if (this.warned.textShadow) return;
    this.warned.textShadow = true;
    console.warn(
      `${this.name}: text shadow spread + blur ${reach}px is wider than the glyph distance field reaches (${limit.toFixed(1)}px), blur reduced first. Raise the font atlas spread or the mtsdf distanceRange`,
    );
  }

  private warnTextInset() {
    if (this.warned.textInset) return;
    this.warned.textInset = true;
    console.warn(`${this.name}: inset shadows are not supported on text, skipped`);
  }

  private warnIsoSort() {
    if (this.warned.isoSort) return;
    this.warned.isoSort = true;
    console.warn(
      `${this.name}: sort mode "gx+gy+z" needs an explicit DrawStyle.sort in grid coordinates, falling back to the screen-space point`,
    );
  }

  private warnNoTarget() {
    if (this.warned.target) return;
    this.warned.target = true;
    console.warn(
      `${this.name} called, but there is no pass for it in the preset`,
    );
  }
  private isGlyphShape(shape: number) {
    return ((1 << shape) & GLYPH_SHAPE_MASK) !== 0;
  }
}

export const Draw = new DrawApi("Draw", "world");
export const DrawGui = new DrawApi<DrawGuiExtra>("DrawGui", "ui", {
  shadows: true,
});
