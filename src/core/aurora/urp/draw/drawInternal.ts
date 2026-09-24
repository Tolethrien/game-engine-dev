import AssetManager from "@aurora/assetManager";
import VertexLayout, {
  VertexFields,
  VertexWriter,
} from "@aurora/utils/vertexLayout";
import AxiomMath from "@axiom/math";

// shared by both passes, must match InstanceIn in both shaders, locations in field order
const INSTANCE_FIELDS = {
  position: "float32x2",
  size: "float32x2",
  rotation: "float32",
  color: "unorm8x4",
  // meaning depends on shape, written only through the functions below
  shapeData: "float32x4",
  outlineWidth: "float32",
  outlineColor: "unorm8x4",
  shape: "uint32",
  uvRect: "float32x4",
  layer: "uint32",
  params: "float32x4",
  materialClip: "uint32",
} satisfies VertexFields;
// gui draws in call order, so it carries no sort point
export const GUI_LAYOUT = new VertexLayout(INSTANCE_FIELDS, {
  stepMode: "instance",
});
// sortPoint last, so locations 0-11 are the same as in the gui layout
export const WORLD_LAYOUT = new VertexLayout(
  { ...INSTANCE_FIELDS, sortPoint: "float32x3" },
  { stepMode: "instance" },
);
export type InstanceWriter = VertexWriter<typeof INSTANCE_FIELDS>;
export type WorldWriter = ReturnType<typeof WORLD_LAYOUT.createWriter>;

// must match SHAPE_* in both shaders
export enum Shape {
  Box = 0,
  Ellipse = 1,
  Quad = 2,
  // glyph of an mtsdf atlas, the one field that stays sharp at any camera zoom
  Mtsdf = 3,
  // only the outline ring of a letter, drawn before the fills of its text
  MtsdfOutline = 4,
}
// must match SHAPE_* in shaders/drawGuiShader.wgsl, the world shader never sees them
export enum GuiShape {
  // glyph of a bitmap or dynamic font: coverage in alpha, distance in red
  Glyph = 5,
  GlyphOutline = 6,
  // box-shadow: box geometry, blur in outlineWidth, params = offset.xy, spread, inset
  Shadow = 7,
  InnerShadow = 8,
  // text shadow: glyph quad moved by the offset, blur in outlineWidth, params.x = spread
  GlyphShadow = 9,
  MtsdfShadow = 10,
  // backdrop-filter: box geometry, params.x = blur sigma; reads the group snapshot
  Backdrop = 11,
  // the same reading the scene pyramid, no gui lies under it
  BackdropScene = 12,
}

// must match UI_ATLAS in both shaders, marks a layer of the ui texture array
const UI_ATLAS = 0x80000000;
export type DrawAtlas = "world" | "ui";

// topLeft, topRight, bottomRight, bottomLeft
export type CornerRadius = number | [number, number, number, number];

// any writer with a shapeData field: draw instances and lights
type ShapeDataWriter = Pick<InstanceWriter, "shapeData">;

export function clearShapeData(view: ShapeDataWriter) {
  view.shapeData(0, 0, 0, 0);
}
// box: corner radii
export function writeCorners(view: ShapeDataWriter, rounded: CornerRadius = 0) {
  if (typeof rounded === "number") {
    view.shapeData(rounded, rounded, rounded, rounded);
  } else {
    view.shapeData(rounded[0], rounded[1], rounded[2], rounded[3]);
  }
}
// quad: a in position, b in size, c and d in shapeData
export function writeQuadPoints(
  view: InstanceWriter,
  a: Position2D,
  b: Position2D,
  c: Position2D,
  d: Position2D,
) {
  view.position(a.x, a.y);
  view.size(b.x, b.y);
  view.shapeData(c.x, c.y, d.x, d.y);
  view.rotation(0);
}
export function texturePage(texture: string, atlas: DrawAtlas) {
  return atlas === "ui"
    ? AssetManager.getUITexture(texture)
    : AssetManager.getTexture(texture);
}
// negative uv size flips the texture
export function writeTexture(
  view: InstanceWriter,
  texture: string,
  crop: Crop | undefined,
  flipX = false,
  flipY = false,
  atlas: DrawAtlas = "world",
) {
  const page = texturePage(texture, atlas);
  let u = crop?.x ?? 0;
  let v = crop?.y ?? 0;
  let uWidth = crop?.width ?? page.width;
  let vHeight = crop?.height ?? page.height;
  if (flipX) {
    u += uWidth;
    uWidth = -uWidth;
  }
  if (flipY) {
    v += vHeight;
    vHeight = -vHeight;
  }
  view.uvRect(u, v, uWidth, vHeight);
  view.layer(atlas === "ui" ? (page.index | UI_ATLAS) >>> 0 : page.index);
}

// glyph size in its text block, two 12 bit values in one float (exact up to 2^24)
const UV_PACK = Object.freeze({ step: 4095, base: 4096 });
// glyph: x = distance field reach in atlas texels, y z = corner of the letter in its
// text block (0..1), w = its size in the block; a letter on its own is 0, 0 and 1 x 1
export function writeGlyphField(
  view: InstanceWriter,
  range: number,
  blockX: number,
  blockY: number,
  blockWidth: number,
  blockHeight: number,
) {
  const { clamp } = AxiomMath;
  const packedSize =
    Math.round(clamp(blockWidth, 0, 1) * UV_PACK.step) +
    Math.round(clamp(blockHeight, 0, 1) * UV_PACK.step) * UV_PACK.base;
  view.shapeData(range, clamp(blockX, 0, 1), clamp(blockY, 0, 1), packedSize);
}
