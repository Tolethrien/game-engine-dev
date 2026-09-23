import { deepMerge } from "@/core/axiom/utils";
import RenderGraph from "../renderGraph";
import { RenderPreset } from "../preset";
import ScreenPas from "./passes/screenPass";
import WorldPass from "./passes/worldPass";
import GuiPass from "./passes/guiPass";
export type SortMode = "none" | "y" | "layer" | "y+x" | "y+x+z";
export type SortAnchor = "top" | "center" | "bottom";

export interface SortProps {
  sortMode: SortMode;
  sortAnchor: SortAnchor;
  zRange: [number, number];
  step: { x: number; y: number; z: number };
}
export interface URPProps extends SortProps {}
const BASE_CONFIG: URPProps = {
  sortMode: "none",
  sortAnchor: "center",
  step: { x: 1, y: 1, z: 1 },
  zRange: [0, 255],
};
export default class URP extends RenderPreset<URPProps> {
  readonly name = "URP";

  public static async init(props: DeepPartial<URPProps> = {}) {
    const base = structuredClone(BASE_CONFIG);
    const config = deepMerge(base, props);
    await RenderGraph.setPreset(new URP(config));
  }

  passes() {
    return [new WorldPass(this.config), new GuiPass(), new ScreenPas()];
  }
  info() {
    return {
      "opaque path":
        this.config.sortMode === "none" ? "off (sortMode none)" : "on",
    };
  }
}
