import { deepMerge } from "@/core/axiom/utils";
import RenderGraph from "../renderGraph";
import { RenderPreset } from "../preset";
import ScreenPas from "./passes/screenPass";
import WorldPass from "./passes/worldPass";
import GuiPass from "./passes/guiPass";
import LightPass from "./passes/lightPass";
import LightCompositePass from "./passes/lightCompositePass";
import PostPass from "./passes/postPass";
import EffectPass from "./passes/effectPass";
import BloomPass from "./passes/bloomPass";
import DiffusionPass from "./passes/diffusionPass";
import BlurPass from "./passes/blurPass";
import { BLOOM_DEFAULTS, postDraw } from "./draw/drawPost";
import { lightDraw } from "./draw/drawLight";
import { debug } from "@debug";
import type { AgxLook, BloomProps, ToneMapMode } from "./draw/drawTypes";
import ScreenEffect from "./effects/screenEffect";
export type SortMode = "none" | "y" | "layer" | "y+x" | "y+x+z";
export type SortAnchor = "top" | "center" | "bottom";

export interface SortProps {
  sortMode: SortMode;
  sortAnchor: SortAnchor;
  zRange: [number, number];
  step: { x: number; y: number; z: number };
}
export interface ToneMapProps {
  // "none" by default: every curve darkens a scene drawn as ldr, turn it on knowingly;
  // start value, Post.setToneMapping changes it live
  mode: ToneMapMode;
  // stops: the scene is scaled by 2^exposure before the curve; start value, Post.setExposure changes it live
  exposure: number;
  // start value, Post.setAgxLook changes it live; only for mode "agx"
  look: AgxLook;
}
export interface URPProps extends SortProps {
  toneMapping: ToneMapProps;
  // start value, Light.setAmbient({ enabled }) changes it live
  lighting: { enabled: boolean };
  // start values, Post.setBloom changes them live
  bloom: BloomProps;
}
const BASE_CONFIG: URPProps = {
  sortMode: "none",
  sortAnchor: "center",
  step: { x: 1, y: 1, z: 1 },
  zRange: [0, 255],
  toneMapping: { mode: "none", exposure: 0, look: "none" },
  lighting: { enabled: true },
  bloom: { ...BLOOM_DEFAULTS },
};
export default class URP extends RenderPreset<URPProps> {
  readonly name = "URP";

  public static async init(props: DeepPartial<URPProps> = {}) {
    const base = structuredClone(BASE_CONFIG);
    const config = deepMerge(base, props);
    lightDraw.setAmbient({ enabled: config.lighting.enabled });
    postDraw.setBloom(config.bloom);
    postDraw.setToneMapping(config.toneMapping.mode);
    postDraw.setExposure(config.toneMapping.exposure);
    postDraw.setAgxLook(config.toneMapping.look);
    debug.aurora.mood(postDraw, lightDraw, {
      get: () => ({
        sortMode: config.sortMode,
        sortAnchor: config.sortAnchor,
        step: config.step,
        zRange: config.zRange,
      }),
      apply: (changes) =>
        void URP.init({
          ...config,
          toneMapping: {
            mode: postDraw.getToneMapping,
            exposure: postDraw.getExposure,
            look: postDraw.getAgxLook,
          },
          bloom: { ...postDraw.getBloom },
          lighting: { enabled: lightDraw.getAmbient.enabled },
          ...changes,
        }),
      effects: () => ScreenEffect.getAll,
      effect: (name) => ScreenEffect.get(name),
    });
    await RenderGraph.setPreset(new URP(config));
  }

  passes() {
    return [
      new WorldPass(this.config),
      new LightPass(),
      new EffectPass("world"),
      new LightCompositePass(),
      new BloomPass(),
      new DiffusionPass(),
      new BlurPass(),
      new EffectPass("hdr"),
      new PostPass(),
      new EffectPass("screen"),
      new GuiPass(),
      new ScreenPas(),
    ];
  }
  info() {
    return {
      "opaque path":
        this.config.sortMode === "none" ? "off (sortMode none)" : "on",
      "tone mapping": postDraw.getToneMapping,
    };
  }
}
