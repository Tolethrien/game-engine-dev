import { DrawGui, Post } from "@/core/aurora/urp/draw/draw";
import { DIFFUSION_DEFAULTS } from "@aurora/urp/draw/drawPost";
import type { DiffusionProps } from "@aurora/urp/draw/drawTypes";
import Aurora from "@aurora/core";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";
import { COLOR } from "@axiom/color";

interface DiffusionPreset {
  label: string;
  props: Partial<DiffusionProps>;
}
// each preset starts from the defaults, so nothing leaks from the one before
const PRESETS: DiffusionPreset[] = [
  { label: "off", props: {} },
  { label: "soft focus", props: { amount: 0.3, radius: 4 } },
  {
    label: "after rain",
    props: {
      amount: 0.45,
      radius: 5,
      haze: 0.25,
      hazeColor: [200, 215, 255, 255],
    },
  },
  {
    label: "heavy mist",
    props: {
      amount: 0.6,
      radius: 6,
      haze: 0.6,
      hazeColor: [220, 225, 235, 255],
    },
  },
  { label: "haze only", props: { haze: 0.4 } },
];
// two lines above the bottom, under it sit the day clock and the other labels
const DIFFUSION_TEST = {
  key: KEY.r,
  font: "lato",
  size: 28,
  margin: 24,
  lines: 2,
  lineGap: 36,
};
let current = 0;

// R steps through the presets over the world
export function diffusionTest() {
  if (InputManager.isKeyPressed(DIFFUSION_TEST.key)) {
    current = (current + 1) % PRESETS.length;
    Post.setDiffusion({ ...DIFFUSION_DEFAULTS, ...PRESETS[current].props });
  }
  const { size, margin, lines, lineGap } = DIFFUSION_TEST;
  DrawGui.text({
    position: {
      x: margin,
      y: Aurora.canvas.height - margin - size - lines * lineGap,
    },
    font: DIFFUSION_TEST.font,
    text: `diffusion: ${PRESETS[current].label}  (R)`,
    size,
    color: COLOR.WHITE,
  });
}
