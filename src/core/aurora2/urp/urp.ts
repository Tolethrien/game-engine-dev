import { deepMerge } from "@axiom/utils";
import RenderGraph from "../renderGraph";
import DrawPass from "./passes/draw";
import PresentPass from "./passes/present";

export type SortMode = "none" | "y";
export type SortAnchor = "top" | "center" | "bottom";
export interface URPSortConfig {
  /**
   * none: draw order is call order, no depth buffer
   * y: lower on screen is in front
   */
  mode: SortMode;
  /** point of the shape used for sorting, rotation aware */
  anchor: SortAnchor;
  /** render pixels outside the view that still sort correctly */
  margin: number;
}
export interface URPConfig {
  sort: URPSortConfig;
}

const BASE_CONFIG: URPConfig = {
  sort: { mode: "none", anchor: "bottom", margin: 540 },
};

export default class URP {
  private static config: URPConfig = structuredClone(BASE_CONFIG);

  public static get getConfig(): DeepReadonly<URPConfig> {
    return this.config;
  }

  public static async init(config: DeepPartial<URPConfig> = {}) {
    this.config = deepMerge(structuredClone(BASE_CONFIG), config);
    const { sort } = this.config;
    await RenderGraph.setPreset(() => [new DrawPass(sort), new PresentPass()]);
  }
}
