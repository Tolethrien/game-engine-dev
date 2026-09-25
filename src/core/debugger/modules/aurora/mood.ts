import type { LightDraw } from "@/core/aurora/urp/draw/drawLight";
import {
  BLOOM_DEFAULTS,
  BLUR_DEFAULTS,
  COLOR_DEFAULTS,
  DIFFUSION_DEFAULTS,
  EFFECT_DEFAULTS,
  type PostDraw,
} from "@/core/aurora/urp/draw/drawPost";
import type {
  AgxLook,
  ScreenBlend,
  ToneMapMode,
} from "@/core/aurora/urp/draw/drawTypes";
import type { TweakField } from "../tweak/report";
import { auroraPage } from "./pages";
import type { TweakFieldsSection, TweakPanel } from "../../interfaces";

const TONE_MAPPING: readonly ToneMapMode[] = ["none", "reinhard", "aces", "filmic", "agx"];
const AGX_LOOKS: readonly AgxLook[] = ["none", "punchy", "golden"];
export const SCREEN_BLENDS: readonly ScreenBlend[] = ["multiply", "mix", "additive"];
const BLUR_MASKS = ["full", "vignette"] as const;
const AMBIENT_DEFAULTS = { enabled: true, from: [255, 255, 255, 255], to: [255, 255, 255, 255], angle: 0, intensity: 1 };

const slider = (key: string, min: number, max: number, step = 0.01): TweakField => ({
  key,
  control: { kind: "slider", min, max, step },
});
const select = (key: string, options: readonly string[]): TweakField => ({
  key,
  control: { kind: "select", options },
});
const color = (key: string): TweakField => ({ key, control: { kind: "color" } });
const point = (key: string): TweakField => ({ key, control: { kind: "point" } });

function valueSection(
  title: string,
  call: string,
  field: TweakField,
  defaultValue: unknown,
  get: () => unknown,
  set: (value: never) => void,
): TweakFieldsSection {
  return {
    defaults: { [field.key]: defaultValue },
    title,
    call,
    arg: "value",
    fields: [field],
    get: () => ({ [field.key]: get() }),
    set: (values) => set(values[field.key] as never),
  };
}

function objectSection<Props extends object>(
  title: string,
  call: string,
  fields: TweakField[],
  defaults: object,
  get: () => Props,
  set: (values: Partial<Props>) => void,
): TweakFieldsSection {
  return {
    defaults: defaults as Record<string, unknown>,
    title,
    call,
    arg: "object",
    fields,
    get: () => ({ ...get() }) as Record<string, unknown>,
    set: (values) => set(values as Partial<Props>),
  };
}

export function moodPanel(post: PostDraw, light: LightDraw): TweakPanel {
  return {
    title: "Mood",
    ...auroraPage("mood"),
    sections: [
      valueSection(
        "Tone mapping",
        "Post.setToneMapping",
        select("mode", TONE_MAPPING),
        "none",
        () => post.getToneMapping,
        (mode) => post.setToneMapping(mode),
      ),
      valueSection(
        "AgX look",
        "Post.setAgxLook",
        select("look", AGX_LOOKS),
        "none",
        () => post.getAgxLook,
        (look) => post.setAgxLook(look),
      ),
      valueSection(
        "Exposure",
        "Post.setExposure",
        slider("stops", -5, 5),
        0,
        () => post.getExposure,
        (stops) => post.setExposure(stops),
      ),
      objectSection(
        "Color",
        "Post.setColor",
        [
          slider("brightness", 0, 2),
          slider("contrast", 0, 2),
          slider("saturation", 0, 2),
          slider("temperature", -1, 1),
          slider("tint", -1, 1),
          slider("hueShift", -180, 180, 1),
          color("filter"),
          slider("sepia", 0, 1),
          slider("invert", 0, 1),
        ],
        COLOR_DEFAULTS,
        () => post.getColor,
        (values) => post.setColor(values),
      ),
      objectSection(
        "Ambient",
        "Light.setAmbient",
        [
          { key: "enabled", control: { kind: "toggle" } },
          color("from"),
          color("to"),
          { key: "angle", control: { kind: "angle" } },
          slider("intensity", 0, 4),
        ],
        AMBIENT_DEFAULTS,
        () => light.getAmbient,
        (values) => light.setAmbient(values),
      ),
      objectSection(
        "Bloom",
        "Post.setBloom",
        [
          { key: "enabled", control: { kind: "toggle" } },
          slider("threshold", 0, 4),
          slider("knee", 0, 1),
          slider("intensity", 0, 2),
          slider("scatter", 0, 1),
          slider("radius", 1, 8, 1),
        ],
        BLOOM_DEFAULTS,
        () => post.getBloom,
        (values) => post.setBloom(values),
      ),
      objectSection(
        "Diffusion",
        "Post.setDiffusion",
        [
          slider("amount", 0, 1),
          slider("radius", 1, 6, 1),
          slider("haze", 0, 1),
          color("hazeColor"),
        ],
        DIFFUSION_DEFAULTS,
        () => post.getDiffusion,
        (values) => post.setDiffusion(values),
      ),
      objectSection(
        "Blur",
        "Post.setBlur",
        [
          slider("sigma", 0, 64, 0.1),
          slider("amount", 0, 1),
          select("mask", BLUR_MASKS),
          slider("reach", 0, 2),
          slider("smoothness", 0, 1),
          slider("roundness", 0, 1),
          point("center"),
        ],
        BLUR_DEFAULTS,
        () => post.getBlur,
        (values) => post.setBlur(values),
      ),
      objectSection(
        "Vignette",
        "Post.setVignette",
        [
          slider("intensity", 0, 1),
          slider("smoothness", 0, 1),
          slider("roundness", 0, 1),
          point("center"),
          color("color"),
          select("blend", SCREEN_BLENDS),
        ],
        EFFECT_DEFAULTS.vignette,
        () => post.getEffects.vignette,
        (values) => post.setVignette(values),
      ),
      objectSection(
        "Grain",
        "Post.setGrain",
        [slider("intensity", 0, 1), slider("response", 0, 1), slider("size", 1, 8, 0.1)],
        EFFECT_DEFAULTS.grain,
        () => post.getEffects.grain,
        (values) => post.setGrain(values),
      ),
      objectSection(
        "Chroma",
        "Post.setChroma",
        [slider("intensity", 0, 2), point("center")],
        EFFECT_DEFAULTS.chroma,
        () => post.getEffects.chroma,
        (values) => post.setChroma(values),
      ),
      objectSection(
        "Radial blur",
        "Post.setRadialBlur",
        [slider("strength", 0, 1), point("center"), slider("samples", 2, 32, 1)],
        EFFECT_DEFAULTS.radialBlur,
        () => post.getEffects.radialBlur,
        (values) => post.setRadialBlur(values),
      ),
      valueSection(
        "Posterize",
        "Post.setPosterize",
        slider("levels", 0, 32, 1),
        EFFECT_DEFAULTS.posterize,
        () => post.getEffects.posterize,
        (levels) => post.setPosterize(levels),
      ),
    ],
  };
}
