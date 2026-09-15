import { TextureSource, UISource } from "./assetManager";

export type RenderRes = "1920x1080" | "1280x720" | "854x480" | "640x360";
export type Profiler = "none" | "minimal" | "normal" | "extended";

export interface AuroraConfig {
  rendering: {
    renderRes: RenderRes;
    transparentCanvas: boolean;
    canvasColor: RGBA;
    computeGroupSize: 8 | 16;
    normalMaps: boolean;
    heightMaps: boolean;
  };
  userTextures: TextureSource[];
  userUI: UISource[];
  debugger: Profiler;
}
export type ChangeableRenderConfig = {
  rendering: Pick<AuroraConfig["rendering"], "renderRes" | "canvasColor">;
};
export const BASE_CONFIG: AuroraConfig = {
  rendering: {
    renderRes: "854x480",
    transparentCanvas: false,
    canvasColor: [255, 25, 55, 255],
    computeGroupSize: 8,
    normalMaps: false,
    heightMaps: false,
  },
  userTextures: [],
  userUI: [],
  debugger: "minimal",
};
