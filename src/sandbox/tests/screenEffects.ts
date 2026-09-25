import { DrawGui, Post } from "@/core/aurora/urp/draw/draw";
import ScreenEffect from "@aurora/urp/effects/screenEffect";
import type {
  EffectLayer,
  EffectStage,
  SceneBlur,
} from "@aurora/urp/draw/drawTypes";
import Aurora from "@aurora/core";
import Time from "@/core/engine/time";
import { BLUR_DEFAULTS } from "@aurora/urp/draw/drawPost";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";
import { COLOR } from "@axiom/color";
import screenMistWgsl from "./effects/screenMist.wgsl?raw";
import worldMistWgsl from "./effects/worldMist.wgsl?raw";

// registered at import, before the build, so no rebuild is needed
const screenMist = ScreenEffect.create({
  name: "screenMist",
  fragment: screenMistWgsl,
  params: { scale: 3, speed: 0.08, density: 0.9 },
});
const worldMist = ScreenEffect.create({
  name: "worldMist",
  fragment: worldMistWgsl,
  params: { scale: 0.004, speed: 25, density: 0.85 },
});
const MIST_COLOR: RGBA = [225, 232, 245, 255];

interface EffectsPreset {
  label: string;
  stage: EffectStage;
  layers: EffectLayer[];
  blur?: Partial<SceneBlur>;
  // sigma swings between 0 and blur.sigma, shows level changes of the pyramid
  pulse?: boolean;
}
const PRESETS: EffectsPreset[] = [
  { label: "off", stage: "screen", layers: [] },
  {
    label: "lit mist in the world (world stage)",
    stage: "world",
    layers: [{ effect: worldMist, color: MIST_COLOR }],
  },
  {
    label: "mist at the edges (vignette mask)",
    stage: "screen",
    layers: [
      {
        effect: screenMist,
        mask: "vignette",
        reach: 1.1,
        smoothness: 0.6,
        color: MIST_COLOR,
      },
    ],
  },
  {
    label: "mist over the screen (full mask)",
    stage: "screen",
    layers: [
      {
        effect: screenMist,
        intensity: 0.45,
        params: screenMist.pack({ scale: 2, density: 0.8 }),
        color: MIST_COLOR,
      },
    ],
  },
  {
    label: "both, stacked",
    stage: "screen",
    layers: [
      {
        effect: screenMist,
        intensity: 0.35,
        params: screenMist.pack({ scale: 2 }),
        color: MIST_COLOR,
      },
      {
        effect: screenMist,
        mask: "vignette",
        reach: 1.1,
        smoothness: 0.6,
        color: MIST_COLOR,
      },
    ],
  },
  {
    label: "blur: soft (sigma 3)",
    stage: "screen",
    layers: [],
    blur: { sigma: 3 },
  },
  {
    label: "blur: pause menu (sigma 24)",
    stage: "screen",
    layers: [],
    blur: { sigma: 24 },
  },
  {
    label: "blur: heavy (sigma 80)",
    stage: "screen",
    layers: [],
    blur: { sigma: 80 },
  },
  {
    label: "blur: half mixed (sigma 40, amount 0.5)",
    stage: "screen",
    layers: [],
    blur: { sigma: 40, amount: 0.5 },
  },
  {
    label: "blur: edges (vignette mask)",
    stage: "screen",
    layers: [],
    blur: { sigma: 16, mask: "vignette", reach: 1.2, smoothness: 0.6 },
  },
  {
    label: "blur: pulsing 0..40",
    stage: "screen",
    layers: [],
    blur: { sigma: 40 },
    pulse: true,
  },
  {
    label: "blur + mist at the edges",
    stage: "screen",
    layers: [
      {
        effect: screenMist,
        mask: "vignette",
        reach: 1.1,
        smoothness: 0.6,
        color: MIST_COLOR,
      },
    ],
    blur: { sigma: 10, mask: "vignette", reach: 1.1, smoothness: 0.6 },
  },
];
const BLUR_PULSE_SECONDS = 4;
// three lines above the bottom, under it sit the diffusion and day labels
const SCREEN_EFFECTS_TEST = {
  key: KEY.v,
  font: "lato",
  size: 28,
  margin: 24,
  lines: 3,
  lineGap: 36,
};
const STAGES: EffectStage[] = ["world", "hdr", "screen"];
let current = 0;

// V steps through the presets; every stage is cleared first, so only the shown one runs
export function screenEffectsTest() {
  if (InputManager.isKeyPressed(SCREEN_EFFECTS_TEST.key)) {
    current = (current + 1) % PRESETS.length;
    const preset = PRESETS[current];
    for (const stage of STAGES) Post.setEffects(stage, []);
    Post.setEffects(preset.stage, preset.layers);
    // from the defaults, so values of the preset before do not leak
    Post.setBlur({ ...BLUR_DEFAULTS, ...preset.blur });
    Post.setColor({ contrast: 2, saturation: 0.2 });
    Post.setToneMapping("agx");
    Post.setAgxLook("punchy");
    Post.setGrain({ intensity: 1 });
  }
  const preset = PRESETS[current];
  if (preset.pulse && preset.blur?.sigma) {
    const phase = (Time.getTimeInSeconds() / BLUR_PULSE_SECONDS) * Math.PI * 2;
    Post.setBlur({ sigma: preset.blur.sigma * (0.5 - 0.5 * Math.cos(phase)) });
  }
  const { size, margin, lines, lineGap } = SCREEN_EFFECTS_TEST;
  DrawGui.text({
    position: {
      x: margin,
      y: Aurora.canvas.height - margin - size - lines * lineGap,
    },
    font: SCREEN_EFFECTS_TEST.font,
    text: `screen effects: ${preset.label}  (V)`,
    size,
    color: COLOR.WHITE,
  });
}
