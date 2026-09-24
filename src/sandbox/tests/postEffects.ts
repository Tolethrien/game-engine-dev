import { DrawGui, Post } from "@/core/aurora/urp/draw/draw";
import { EFFECT_DEFAULTS } from "@aurora/urp/draw/drawPost";
import { COLOR } from "@axiom/color";
import Aurora from "@aurora/core";

interface EffectPreset {
  label: string;
  // once when the preset starts
  start(): void;
  // every frame while it is shown, for animated ones
  update?(t: number): void;
}
const PRESETS: EffectPreset[] = [
  { label: "none", start: () => {} },
  { label: "vignette", start: () => Post.setVignette({ intensity: 0.6 }) },
  {
    label: "vignette red pulse (mix)",
    start: () =>
      Post.setVignette({
        color: [255, 0, 0, 255],
        blend: "mix",
        smoothness: 0.4,
      }),
    update: (t) =>
      Post.setVignette({ intensity: 0.55 + 0.2 * Math.sin(t * Math.PI * 2) }),
  },
  {
    label: "vignette additive glow, ellipse",
    start: () =>
      Post.setVignette({
        intensity: 0.8,
        roundness: 0,
        color: [80, 160, 255, 255],
        blend: "additive",
      }),
  },
  { label: "film grain", start: () => Post.setGrain({ intensity: 0.35 }) },
  {
    label: "film grain coarse (size 3)",
    start: () => Post.setGrain({ intensity: 0.5, size: 3 }),
  },
  { label: "chroma", start: () => Post.setChroma({ intensity: 1 }) },
  { label: "posterize 4", start: () => Post.setPosterize(4) },
  {
    label: "radial blur",
    start: () => Post.setRadialBlur({ strength: 0.15 }),
  },
  {
    label: "zoom blur + chroma (hit)",
    start: () => {
      Post.setRadialBlur({ strength: 0.08, samples: 16 });
      Post.setChroma({ intensity: 1.5 });
    },
  },
  {
    label: "flash white 0.6 s, every 1.5 s",
    start: () => {},
    update: (t) =>
      repeatEvery(t, POST_EFFECTS.flashEvery, () =>
        Post.flash([255, 255, 255, 255], 0.6),
      ),
  },
  {
    label: "flash red hit (0.5, 0.3 s), every 1.5 s",
    start: () => {},
    update: (t) =>
      repeatEvery(t, POST_EFFECTS.flashEvery, () =>
        Post.flash([255, 0, 0, 255], 1, { amount: 1 }),
      ),
  },
  {
    label: "flash white rise 0.4 s + fade 0.8 s, every 1.5 s",
    start: () => {},
    update: (t) =>
      repeatEvery(t, POST_EFFECTS.flashEvery, () =>
        Post.flash([255, 255, 255, 255], 0.8, { rise: 0.4 }),
      ),
  },
  {
    label: "flash red held 0.3",
    start: () => Post.setFlash({ color: [255, 0, 0, 255], amount: 0.3 }),
  },
];
const POST_EFFECTS = {
  secondsPerPreset: 3,
  font: "lato",
  size: 28,
  margin: 24,
  flashEvery: 1.5,
};
let shown = -1;
let lastBeat = -1;

// cycles the effects one at a time over whatever scene is drawn
export function postEffectsTest(t: number) {
  const index = 11;
  const preset = PRESETS[index];
  if (index !== shown) {
    shown = index;
    lastBeat = -1;
    resetEffects();
    preset.start();
  }
  preset.update?.(t);
  DrawGui.text({
    position: {
      x: POST_EFFECTS.margin,
      y: Aurora.canvas.height - POST_EFFECTS.margin - POST_EFFECTS.size,
    },
    font: POST_EFFECTS.font,
    text: `${index + 1}/${PRESETS.length}  ${preset.label}`,
    size: POST_EFFECTS.size,
    color: COLOR.WHITE,
  });
}

// fires on the first frame and then once per period
function repeatEvery(t: number, seconds: number, action: () => void) {
  const beat = Math.floor(t / seconds);
  if (beat === lastBeat) return;
  lastBeat = beat;
  action();
}
function resetEffects() {
  const defaults = EFFECT_DEFAULTS;
  Post.setRadialBlur(defaults.radialBlur);
  Post.setChroma(defaults.chroma);
  Post.setPosterize(defaults.posterize);
  Post.setVignette(defaults.vignette);
  Post.setFlash(defaults.flash);
  Post.setGrain(defaults.grain);
}
