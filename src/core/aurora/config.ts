import { TextureSource, UISource } from "./assetManager";
import { FontSource } from "./text/font";

export type RenderRes = "1920x1080" | "1280x720" | "854x480" | "640x360";
export type ColorSpace = "linear" | "gamma";
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
  };
  userTextures: TextureSource[];
  userUI: UISource[];
  fonts: FontSource[];
  fontAtlas: FontAtlasConfig;
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
    colorSpace: "linear",
  },
  userTextures: [],
  userUI: [],
  fonts: [],
  fontAtlas: { pageSize: 1024, pages: 4, spread: 8 },
};
