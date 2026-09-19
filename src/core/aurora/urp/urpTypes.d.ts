import type Material from "../material";

export type CornerRadius = number | [number, number, number, number];
export interface DrawOutline {
  width: number;
  color: RGBA;
}
export type MaterialParams = [number, number, number, number];
export type DrawAtlas = "world" | "ui";
export type UvScope = "glyph" | "text";

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
// like css backdrop-filter: blur is sigma (box-shadow blur above is 2 sigma), in canvas px
export interface DrawBackdrop {
  blur: number;
}
// first shadow of a list is on top, like in css
export interface DrawGuiExtra {
  shadow?: DrawShadow | DrawShadow[];
  backdrop?: DrawBackdrop;
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
export interface DrawTextStyle extends DrawStyle {
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
// same geometry as a rect, inset shrinks it and its corners like the css padding box
export interface DrawClip {
  position: Position2D;
  size: Size2D;
  rotation?: number;
  rounded?: CornerRadius;
  inset?: number;
}

export type SortMode = "none" | "y" | "layer" | "y+x" | "y+x+z" | "gx+gy+z";
export type SortAnchor = "top" | "center" | "bottom";
export interface URPSortConfig {
  mode: SortMode;
  anchor: SortAnchor;
  step: { x: number; y: number; z: number };
  zRange: [number, number];
}
export interface URPConfig {
  sort: URPSortConfig;
}
