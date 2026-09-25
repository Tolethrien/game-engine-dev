import type { TextureSource, UISource } from "./assetManager";
import type { FontSource } from "./text/font";

export const RENDER_RES = ["1920x1080", "1280x720", "854x480", "640x360"] as const;
export type RenderRes = (typeof RENDER_RES)[number];
export type ColorSpace = "linear" | "gamma";
// what Aurora.setCamera({ position }) points at: the top left corner or the center of the view
export type CameraOrigin = "topLeft" | "center";
/** pages for glyphs of dynamic fonts, allocated once in config, they do not grow yet */
export interface FontAtlasConfig {
  pageSize: number;
  pages: number;
  /** pixels the outline distance field reaches around every glyph, the widest outline at native size */
  spread: number;
}

export interface AuroraConfig {
  rendering: {
    renderRes: RenderRes;
    transparentCanvas: boolean;
    canvasColor: RGBA;
    computeGroupSize: 8 | 16;
    normalMaps: boolean;
    heightMaps: boolean;
    colorSpace: ColorSpace;
    // player display calibration: > 1 lifts the shadows, black and white stay; applied to the whole image
    gamma: number;
  };
  camera: { origin: CameraOrigin };
  userTextures: TextureSource[];
  userUI: UISource[];
  fonts: FontSource[];
  fontAtlas: FontAtlasConfig;
}
export type ChangeableRenderConfig = {
  rendering: Pick<AuroraConfig["rendering"], "renderRes" | "canvasColor" | "gamma">;
};
export const BASE_CONFIG: AuroraConfig = {
  rendering: {
    renderRes: "854x480",
    transparentCanvas: false,
    canvasColor: [255, 25, 55, 255],
    computeGroupSize: 8,
    normalMaps: false,
    heightMaps: false,
    colorSpace: "linear",
    gamma: 1,
  },
  camera: { origin: "topLeft" },
  userTextures: [],
  userUI: [],
  fonts: [],
  fontAtlas: { pageSize: 1024, pages: 4, spread: 8 },
};
