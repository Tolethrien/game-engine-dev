import { WorldDraw, worldDraw } from "./drawWorld";
import { GuiDraw, guiDraw } from "./drawGui";
import { LightDraw, lightDraw } from "./drawLight";
import { PostDraw, postDraw } from "./drawPost";

type DrawCommand =
  | "rect"
  | "circle"
  | "ellipse"
  | "line"
  | "sprite"
  | "quad"
  | "text"
  | "textBox"
  | "glyph"
  | "pushClip"
  | "popClip";
type LightCommand = "point" | "rect" | "ellipse" | "setAmbient";
type PostCommand =
  | "setBloom"
  | "setDiffusion"
  | "setEffects"
  | "setExposure"
  | "setToneMapping"
  | "setAgxLook"
  | "setColor"
  | "setRadialBlur"
  | "setChroma"
  | "setPosterize"
  | "setVignette"
  | "flash"
  | "setFlash"
  | "setGrain";

// the same instances the passes drive, narrowed to what a game may call;
// prop types live in ./drawTypes
export const Draw: Pick<WorldDraw, DrawCommand> = worldDraw;
export const DrawGui: Pick<GuiDraw, DrawCommand> = guiDraw;
export const Light: Pick<LightDraw, LightCommand> = lightDraw;
export const Post: Pick<PostDraw, PostCommand> = postDraw;
