import type Material from "@aurora/material";
import type { CornerRadius, DrawAtlas } from "./drawInternal";

export type { CornerRadius, DrawAtlas };
export type { DrawClip } from "../clip/clip";
export type MaterialParams = [number, number, number, number];
export type LineCap = "butt" | "round" | "square";
// "text": material uv spans the whole text instead of each letter
export type UvScope = "glyph" | "text";

export interface Outline {
  width: number;
  color: RGBA;
}
// like css box-shadow: blur is 2 sigma, spread grows the shape and its corners;
// the first shadow of a list is on top
export interface DrawShadow {
  color: RGBA;
  offset?: Position2D;
  blur?: number;
  spread?: number;
  inset?: boolean;
}

// like css backdrop-filter: blur is sigma in canvas px (box-shadow blur above is 2 sigma)
export interface DrawBackdrop {
  blur: number;
}

export interface Outlined {
  outline?: Outline;
}
export interface Materialed {
  material?: Material;
  params?: MaterialParams;
}
export interface ShapeStyle extends Outlined, Materialed {}
// white when left out
export interface Filled extends ShapeStyle {
  color?: RGBA;
}

// shared geometry in 2d, the world adds z and sort, the gui its effects
export interface RectBase extends Filled {
  position: Position2D;
  size: Size2D;
  rotation?: number;
  rounded?: CornerRadius;
}
export interface CircleBase extends Filled {
  position: Position2D;
  radius: number;
}
export interface EllipseBase extends Filled {
  position: Position2D;
  size: Size2D;
  rotation?: number;
}
export interface LineBase extends Filled {
  from: Position2D;
  to: Position2D;
  width: number;
  cap?: LineCap;
}
export interface SpriteBase extends ShapeStyle {
  position: Position2D;
  // crop size when left out, then the whole texture
  size?: Size2D;
  tint?: RGBA;
  texture: string;
  // world draws from "world", gui from "ui" when left out
  atlas?: DrawAtlas;
  crop?: Crop;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  rounded?: CornerRadius;
}
export interface QuadBase extends Materialed {
  // clockwise from top left, the texture corners follow this order
  points: [Position2D, Position2D, Position2D, Position2D];
  color?: RGBA;
  texture?: string;
  atlas?: DrawAtlas;
  crop?: Crop;
}
export interface TextStyleBase extends ShapeStyle {
  position: Position2D;
  color?: RGBA;
  uvScope?: UvScope;
}
export interface TextBase extends TextStyleBase {
  text: string;
  font?: string;
  size?: number;
  letterSpacing?: number;
}
export interface TextBoxBase extends TextStyleBase {
  scale?: number;
}
export interface CharBase extends TextStyleBase {
  char: string;
  font?: string;
  size?: number;
}

// world: z and an explicit sort point only feed the sorting, they never move a shape
export interface Sortable {
  sort?: Position3D;
}
export interface Rect extends RectBase, Sortable {
  position: Position3D;
}
export interface Circle extends CircleBase, Sortable {
  position: Position3D;
}
export interface Ellipse extends EllipseBase, Sortable {
  position: Position3D;
}
export interface Line extends LineBase, Sortable {
  z: number;
}
export interface Sprite extends SpriteBase, Sortable {
  position: Position3D;
}
export interface Quad extends QuadBase, Sortable {
  z: number;
}
export interface Text extends TextBase, Sortable {
  position: Position3D;
}
export interface TextBoxStyle extends TextBoxBase, Sortable {
  position: Position3D;
}
export interface Char extends CharBase, Sortable {
  position: Position3D;
}

// gui: drawn in call order, no z and no sort
export interface Shadowed {
  shadow?: DrawShadow | DrawShadow[];
}
// blurs everything drawn under the shape, the scene and earlier gui
export interface Backdropped {
  backdrop?: DrawBackdrop;
}
export interface GuiRect extends RectBase, Shadowed, Backdropped {}
export interface GuiCircle extends CircleBase, Shadowed, Backdropped {}
export type GuiEllipse = EllipseBase;
export type GuiLine = LineBase;
export interface GuiSprite extends SpriteBase, Shadowed, Backdropped {}
export type GuiQuad = QuadBase;
export interface GuiText extends TextBase, Shadowed {}
export interface GuiTextBoxStyle extends TextBoxBase, Shadowed {}
export interface GuiChar extends CharBase, Shadowed {}
