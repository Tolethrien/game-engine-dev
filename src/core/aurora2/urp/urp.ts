import { deepMerge } from "@axiom/utils";
import RenderGraph from "../renderGraph";
import DrawPass from "./passes/draw";
import PresentPass from "./passes/present";

export type SortMode = "none" | "y" | "layer" | "y+x" | "y+x+z";
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

const BASE_CONFIG: URPConfig = {
  sort: {
    mode: "none",
    anchor: "bottom",
    step: { x: 1, y: 1, z: 1 },
    zRange: [0, 255],
  },
};
// gui is layered in call order, like an element tree
const GUI_SORT: URPSortConfig = {
  mode: "none",
  anchor: "top",
  step: { x: 1, y: 1, z: 1 },
  zRange: [0, 0],
};

export default class URP {
  private static config: URPConfig = structuredClone(BASE_CONFIG);

  public static get getConfig(): DeepReadonly<URPConfig> {
    return this.config;
  }

  public static async init(config: DeepPartial<URPConfig> = {}) {
    this.config = deepMerge(structuredClone(BASE_CONFIG), config);
    const { sort } = this.config;
    await RenderGraph.setPreset(() => [
      new DrawPass({
        name: "draw",
        space: "world",
        target: "offscreenCanvas",
        sort,
      }),
      new DrawPass({ name: "gui", space: "screen", target: "gui", sort: GUI_SORT }),
      new PresentPass(),
    ]);
  }
}
