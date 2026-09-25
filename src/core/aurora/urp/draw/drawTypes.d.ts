import type Material from "@aurora/material";
import type ScreenEffect from "../effects/screenEffect";
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
  kerning?: boolean;
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

// light: added over the ambient into the light map, the world is multiplied by it
export interface AmbientLight {
  // off: the light map stays white, the composite leaves the frame and lights are not recorded
  enabled: boolean;
  // gradient from -> to, equal colors = flat ambient
  from: RGBA;
  to: RGBA;
  // radians, 0 = left to right, grows clockwise (y points down)
  angle: number;
  intensity: number;
}
export interface LightBase {
  // white when left out, alpha scales it like intensity
  color?: RGBA;
  // may go above 1
  intensity?: number;
  // how focused: 0 = flat patch, higher = hotter center and longer tail; 4 when left out
  falloff?: number;
}
// fades from the center to the radius
export interface PointLight extends LightBase {
  position: Position2D;
  radius: number;
}
// full light deeper than softness from the edge; half the shorter side when left out
export interface RectLight extends LightBase {
  position: Position2D;
  size: Size2D;
  rotation?: number;
  rounded?: CornerRadius;
  softness?: number;
}
export interface EllipseLight extends LightBase {
  position: Position2D;
  size: Size2D;
  rotation?: number;
  softness?: number;
}

// the "after rain" look (Orton, Pro-Mist filter): the whole scene softly blurred into itself
// plus a veil of its own average light; off while amount and haze are 0
export interface DiffusionProps {
  // 0..1 mix of the blurred scene, softens without brightening
  amount: number;
  // pyramid levels used, 1..6: how far the softness reaches
  radius: number;
  // strength of the veil: the blurred average light of the area added back, lifts the darks
  haze: number;
  // tints the veil, white = the scene's own light
  hazeColor: RGBA;
}
// post: whole-screen effects on the world, changeable every frame through Post
export type ToneMapMode = "none" | "reinhard" | "aces" | "filmic" | "agx";
// agx only: none = plain, punchy = deeper shadows and stronger colors, golden = warm and muted
export type AgxLook = "none" | "punchy" | "golden";
// after the tone map curve; the defaults change nothing, any other value turns the grading on
export interface ColorGrading {
  // multiplier: 0 = black, 1 = unchanged
  brightness: number;
  // around the display mid grey: 0 = flat grey, 1 = unchanged
  contrast: number;
  // 0 = grayscale, 1 = unchanged
  saturation: number;
  // -1 cold .. 1 warm
  temperature: number;
  // -1 green .. 1 magenta
  tint: number;
  // degrees
  hueShift: number;
  // multiplies the color, alpha ignored
  filter: RGBA;
  // 0..1
  sepia: number;
  // 0..1
  invert: number;
}
// effects: centers in 0..1 of the screen; each starts off, any change from the default turns it on
export interface RadialBlur {
  // 0..1 share of the way to the center the samples reach; 0 = off
  strength: number;
  center: Position2D;
  // 2..32
  samples: number;
}
export interface ChromaticAberration {
  // red pushed out and blue in, growing toward the edges; 0 = off
  intensity: number;
  center: Position2D;
}
// vignette and screen effects: multiply darkens (classic), mix covers with the color, additive glows
export type ScreenBlend = "multiply" | "mix" | "additive";
export interface Vignette {
  // how far in it reaches, 0 = off
  intensity: number;
  // falloff width, higher = softer
  smoothness: number;
  // 1 = circle in pixels, 0 = ellipse stretched to the screen
  roundness: number;
  center: Position2D;
  color: RGBA;
  blend: ScreenBlend;
}
export interface Flash {
  color: RGBA;
  // 0..1
  amount: number;
}
// where in the frame a list of screen effects runs:
// world = before the light composite (the effect gets lit), hdr = before the post lut,
// screen = after the lut, right before the gui
export type EffectStage = "world" | "hdr" | "screen";
export type EffectMask = "full" | "vignette";
// one screen effect in a stage list; left out values are the defaults of EFFECT_LAYER_DEFAULTS
export interface EffectLayer {
  effect: ScreenEffect;
  // in.params, the effect's defaults when left out
  params?: MaterialParams;
  // 0..1 scales how much of the effect is blended in
  intensity?: number;
  blend?: ScreenBlend;
  // in.color, linearized
  color?: RGBA;
  mask?: EffectMask;
  // vignette mask only, like Post.setVignette: how far in it reaches, falloff, shape, center
  reach?: number;
  smoothness?: number;
  roundness?: number;
  center?: Position2D;
}
export interface FlashOptions {
  // peak, 0..1
  amount?: number;
  // seconds from 0 to the peak, 0 = instant
  rise?: number;
}
export interface FilmGrain {
  // 0 = off
  intensity: number;
  // 0..1: how much bright areas hide the grain
  response: number;
  // grain in render pixels
  size: number;
}
// gaussian blur of the world before the post lut, the gui stays sharp; off while sigma or amount is 0
export interface SceneBlur {
  // render pixels
  sigma: number;
  // 0..1 mix of the blurred scene
  amount: number;
  // vignette = sharp middle, blurred edges
  mask: EffectMask;
  // vignette mask only, like Post.setVignette: how far in it reaches, falloff, shape, center
  reach: number;
  smoothness: number;
  roundness: number;
  center: Position2D;
}
export interface BloomProps {
  enabled: boolean;
  // brightest channel above which a pixel glows; 1 = only hdr (emissive, strong lights)
  threshold: number;
  // 0..1 of threshold: width of the soft start, 0 = hard cut
  knee: number;
  // share of the blurred glow added back
  intensity: number;
  // 0..1: weight of the wider levels, higher = longer, softer tail
  scatter: number;
  // pyramid levels used, 1..8: caps how far the glow reaches, independent of scatter;
  // each level doubles the reach (about 4 = a tight halo, 8 = the whole screen)
  radius: number;
}
