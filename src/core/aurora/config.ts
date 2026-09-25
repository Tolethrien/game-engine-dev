import type { TextureSource, UISource } from "./assetManager";
import type { FontSource } from "./text/font";

// the scene renders at a preset height (native = the canvas) times renderScale, the width
// follows the canvas; what the camera shows is camera.viewHeight, quality never changes it
export const RENDER = {
  resolutions: ["native", "720p", "1080p", "1440p", "2160p"],
  heights: { "720p": 720, "1080p": 1080, "1440p": 1440, "2160p": 2160 },
  scale: { min: 0.5, max: 2 },
  // the bloom pyramid needs 8 levels in half of it
  minHeight: 360,
} as const;
export type RenderRes = (typeof RENDER.resolutions)[number];
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
    renderScale: number;
    transparentCanvas: boolean;
    canvasColor: RGBA;
    computeGroupSize: 8 | 16;
    normalMaps: boolean;
    heightMaps: boolean;
    colorSpace: ColorSpace;
    // player display calibration: > 1 lifts the shadows, black and white stay; applied to the whole image
    gamma: number;
  };
  // viewHeight: world units the view shows top to bottom at zoom 1, the width follows the canvas
  camera: { origin: CameraOrigin; viewHeight: number };
  userTextures: TextureSource[];
  userUI: UISource[];
  fonts: FontSource[];
  fontAtlas: FontAtlasConfig;
}
export type ChangeableRenderConfig = {
  rendering: Pick<AuroraConfig["rendering"], "renderRes" | "renderScale" | "canvasColor" | "gamma">;
};
export const BASE_CONFIG: AuroraConfig = {
  rendering: {
    renderRes: "native",
    renderScale: 1,
    transparentCanvas: false,
    canvasColor: [255, 25, 55, 255],
    computeGroupSize: 8,
    normalMaps: false,
    heightMaps: false,
    colorSpace: "linear",
    gamma: 1,
  },
  camera: { origin: "topLeft", viewHeight: 480 },
  userTextures: [],
  userUI: [],
  fonts: [],
  fontAtlas: { pageSize: 1024, pages: 4, spread: 8 },
};
