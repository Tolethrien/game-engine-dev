import { FontGenProps } from "./fontGen";
import dummyTexture from "../assets/dummy.png";
import jerseyImg from "../assets/Jersey25-Regular.png";
import jerseyJson from "../assets/Jersey25-Regular-msdf.json";
import latoImg from "../assets/Lato-Regular.png";
import latoJson from "../assets/Lato-Regular-msdf.json";
import { deepMerge } from "../../../utils/utils";
export type RenderRes = "1920x1080" | "1280x720" | "854x480" | "640x360";
type SortOrder = "none" | "y" | "y+x" | "y+x+z";
type Profiler = "none" | "minimal" | "normal" | "extended";
type UserTexture = { name: string; url: string };
// type CameraProjection = "ortho" | "perspective" | "isometric";
type ToneMaps = "rainhard" | "aces" | "filmic" | "none";

export enum ToneMapList {
  none,
  rainhard,
  aces,
  filmic,
}
export interface AuroraConfig {
  feature: {
    bloom: boolean;
    lighting: boolean;
  };
  bloom: {
    numberOfPasses: number;
    threshold: number;
    knee: number;
    intense: number;
  };
  rendering: {
    renderRes: RenderRes;
    drawOrigin: "center" | "topLeft";
    toneMapping: ToneMaps;
    sortOrder: SortOrder;
    transparentCanvas: boolean;
    canvasColor: RGBA;
    computeGroupSize: 8 | 16 | 32;
  };
  camera: {
    builtInCameraInputs: boolean;
    zoom: { min: number; max: number };
    speed: number;
  };
  debugger: Profiler;
  userTextures: UserTexture[];
  userFonts: FontGenProps[];
}
export interface ChangeableRenderConfig {
  render?: {
    renderRes?: RenderRes;
    canvasColor?: RGBA;
  };
  feature?: {
    bloom?: boolean;
    lighting?: boolean;
  };
}
const INIT_OPTIONS: AuroraConfig = {
  feature: {
    bloom: true,
    lighting: true,
  },
  bloom: { intense: 0.7, knee: 0.2, threshold: 1, numberOfPasses: 4 },
  rendering: {
    drawOrigin: "center",
    renderRes: "854x480",
    toneMapping: "aces",
    sortOrder: "y",
    transparentCanvas: false,
    canvasColor: [255, 255, 255, 255],
    computeGroupSize: 8,
  },
  camera: {
    builtInCameraInputs: true,
    speed: 15,
    zoom: { min: 0.1, max: 10 },
  },
  debugger: "normal",
  userTextures: [],
  userFonts: [],
};
export default function auroraConfig(props: DeepPartial<AuroraConfig>) {
  const config = deepMerge(structuredClone(INIT_OPTIONS), props);
  const hasTextures = props.userTextures?.length ?? 0;
  config.userTextures.unshift({ name: "colorRect", url: dummyTexture });
  if (hasTextures === 0)
    config.userTextures.push({ name: "colorRect", url: dummyTexture });
  config.userFonts.push({
    fontName: "lato",
    img: latoImg,
    json: latoJson,
  });
  config.userFonts.push({
    fontName: "jersey",
    img: jerseyImg,
    json: jerseyJson,
  });
  return config;
}
