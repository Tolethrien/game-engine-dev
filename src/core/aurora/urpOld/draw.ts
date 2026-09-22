import { DrawApi, guiDraw, worldDraw } from "./drawApi";
import type { DrawGuiExtra } from "./urpTypes";

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
type DrawCommands<Extra extends object = {}> = Pick<
  DrawApi<Extra>,
  DrawCommand
>;

// same instances the passes drive, narrowed to what a game may call; prop and config types live in ./urpTypes.d.ts
export const Draw: DrawCommands = worldDraw;
export const DrawGui: DrawCommands<DrawGuiExtra> = guiDraw;
