import { WorldDraw, worldDraw } from "./drawWorld";
import { GuiDraw, guiDraw } from "./drawGui";

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

// the same instances the passes drive, narrowed to what a game may call;
// prop types live in ./drawTypes
export const Draw: Pick<WorldDraw, DrawCommand> = worldDraw;
export const DrawGui: Pick<GuiDraw, DrawCommand> = guiDraw;
