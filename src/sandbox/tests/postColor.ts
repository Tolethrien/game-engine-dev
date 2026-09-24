import { DrawGui, Post } from "@/core/aurora/urp/draw/draw";
import { COLOR_DEFAULTS } from "@aurora/urp/draw/drawPost";
import type { ColorGrading, ToneMapMode } from "@aurora/urp/draw/drawTypes";
import { COLOR } from "@axiom/color";
import Aurora from "@aurora/core";

interface GradingPreset {
  label: string;
  toneMapping: ToneMapMode;
  color: Partial<ColorGrading>;
}
// every preset starts from the defaults, so nothing leaks from the one before
const PRESETS: GradingPreset[] = [
  { label: "agx, neutral", toneMapping: "agx", color: {} },
  { label: "none, neutral (pass off)", toneMapping: "none", color: {} },
  { label: "aces", toneMapping: "aces", color: {} },
  { label: "grayscale", toneMapping: "agx", color: { saturation: 0 } },
  { label: "saturation 1.8", toneMapping: "agx", color: { saturation: 1.8 } },
  { label: "brightness 0.4", toneMapping: "agx", color: { brightness: 0.4 } },
  { label: "contrast 1.6", toneMapping: "agx", color: { contrast: 1.6 } },
  { label: "contrast 0.4", toneMapping: "agx", color: { contrast: 0.4 } },
  { label: "temperature +1", toneMapping: "agx", color: { temperature: 1 } },
  { label: "temperature -1", toneMapping: "agx", color: { temperature: -1 } },
  { label: "tint +1", toneMapping: "agx", color: { tint: 1 } },
  { label: "hue +120", toneMapping: "agx", color: { hueShift: 120 } },
  {
    label: "filter red",
    toneMapping: "agx",
    color: { filter: [255, 120, 120, 255] },
  },
  { label: "sepia", toneMapping: "agx", color: { sepia: 1 } },
  { label: "invert", toneMapping: "agx", color: { invert: 1 } },
  {
    label: "none + grayscale (lut without curve)",
    toneMapping: "none",
    color: { saturation: 0 },
  },
];
// label at the bottom, the fps overlay sits in the top left
const POST_COLOR = { secondsPerPreset: 2.5, font: "lato", size: 28, margin: 24 };
let shown = -1;

// cycles the presets over whatever scene is drawn, the lut rebakes only on a switch
export function postColorTest(t: number) {
  const index = Math.floor(t / POST_COLOR.secondsPerPreset) % PRESETS.length;
  const preset = PRESETS[index];
  if (index !== shown) {
    shown = index;
    Post.setToneMapping(preset.toneMapping);
    Post.setColor({ ...COLOR_DEFAULTS, ...preset.color });
  }
  DrawGui.text({
    position: {
      x: POST_COLOR.margin,
      y: Aurora.canvas.height - POST_COLOR.margin - POST_COLOR.size,
    },
    font: POST_COLOR.font,
    text: `${index + 1}/${PRESETS.length}  ${preset.label}`,
    size: POST_COLOR.size,
    color: COLOR.WHITE,
  });
}
