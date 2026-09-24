import { DrawGui, Light, Post } from "@/core/aurora/urp/draw/draw";
import type { ColorGrading } from "@aurora/urp/draw/drawTypes";
import Aurora from "@aurora/core";
import AxiomMath from "@axiom/math";
import AxiomColor, { COLOR } from "@axiom/color";
import Easing from "@axiom/easing";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";
import Time from "@/core/engine/time";

// one look of the day: its grading (baked into the post lut) and the ambient light
interface DayPhase {
  label: string;
  color: Pick<
    ColorGrading,
    "brightness" | "contrast" | "saturation" | "temperature" | "tint"
  >;
  ambient: RGBA;
  ambientIntensity: number;
}
// in order around the clock, night blends back into morning
const PHASES: DayPhase[] = [
  {
    label: "morning",
    color: {
      brightness: 1.05,
      contrast: 0.95,
      saturation: 0.95,
      temperature: 0.25,
      tint: 0.1,
    },
    ambient: [255, 222, 200, 255],
    ambientIntensity: 0.9,
  },
  {
    label: "afternoon",
    color: {
      brightness: 1,
      contrast: 1.05,
      saturation: 1.1,
      temperature: 0.05,
      tint: 0,
    },
    ambient: [255, 250, 240, 255],
    ambientIntensity: 1,
  },
  {
    label: "evening",
    color: {
      brightness: 0.95,
      contrast: 1.1,
      saturation: 1.15,
      temperature: 0.6,
      tint: 0.15,
    },
    ambient: [255, 160, 110, 255],
    ambientIntensity: 0.7,
  },
  {
    label: "night",
    color: {
      brightness: 0.9,
      contrast: 1.1,
      saturation: 0.6,
      temperature: -0.5,
      tint: 0,
    },
    ambient: [60, 70, 130, 255],
    ambientIntensity: 0.8,
  },
];
// a full day in seconds; each phase holds for part of its slot, then blends into the next
// startHour: the clock shown when morning begins
const DAY = { seconds: 30, hold: 0.4, startHour: 6 };
const LABEL = { font: "lato", size: 28, margin: 24, lineGap: 36 };
// T toggles the passing of time; starts stopped at the beginning of the afternoon
const CLOCK = { toggleKey: KEY.t, startPhase: 1 };
const clock = {
  time: (DAY.seconds / PHASES.length) * CLOCK.startPhase,
  running: false,
};

// the lut is rebaked every frame while blending: 32^3 cells, cheap next to the screen
export function dayNightTest() {
  if (InputManager.isKeyPressed(CLOCK.toggleKey)) clock.running = !clock.running;
  if (clock.running) {
    clock.time = (clock.time + Time.getRawDeltaTime()) % DAY.seconds;
  }
  const slot = DAY.seconds / PHASES.length;
  const time = clock.time;
  const index = Math.floor(time / slot);
  const from = PHASES[index];
  const to = PHASES[(index + 1) % PHASES.length];
  const progress = (time - index * slot) / slot;
  const blend = Easing.easeInOutSine(
    AxiomMath.clamp((progress - DAY.hold) / (1 - DAY.hold), 0, 1),
  );

  Post.setColor({
    brightness: AxiomMath.lerp(from.color.brightness, to.color.brightness, blend),
    contrast: AxiomMath.lerp(from.color.contrast, to.color.contrast, blend),
    saturation: AxiomMath.lerp(from.color.saturation, to.color.saturation, blend),
    temperature: AxiomMath.lerp(
      from.color.temperature,
      to.color.temperature,
      blend,
    ),
    tint: AxiomMath.lerp(from.color.tint, to.color.tint, blend),
  });
  const ambient = AxiomColor.lerpRGBA(from.ambient, to.ambient, blend);
  Light.setAmbient({
    from: ambient,
    to: ambient,
    intensity: AxiomMath.lerp(
      from.ambientIntensity,
      to.ambientIntensity,
      blend,
    ),
  });

  const hour = ((time / DAY.seconds) * 24 + DAY.startHour) % 24;
  const phase = blend === 0 ? from.label : `${from.label} -> ${to.label}`;
  const state = clock.running ? "" : "  (stopped, T)";
  DrawGui.text({
    position: {
      x: LABEL.margin,
      y: Aurora.canvas.height - LABEL.margin - LABEL.size - LABEL.lineGap,
    },
    font: LABEL.font,
    text: `${String(Math.floor(hour)).padStart(2, "0")}:00  ${phase}${state}`,
    size: LABEL.size,
    color: COLOR.WHITE,
  });
}
