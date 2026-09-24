import { Draw, Light } from "@/core/aurora/urp/draw/draw";
import { COLOR } from "@/core/axiom/color";
import { EMISSIVE_MATERIAL } from "@aurora/urp/draw/materials";

// packed once, not per draw
const NEON = EMISSIVE_MATERIAL.pack({ intensity: 3 });

const LIGHT_COLORS: RGBA[] = [
  [255, 120, 40, 255],
  [60, 140, 255, 255],
  [120, 255, 120, 255],
];

// dark night ambient, orbiting point lights, a soft window and an ellipse lamp
export function lightsTest(t: number) {
  Light.setAmbient({
    from: [30, 35, 70, 255],
    to: [10, 10, 30, 255],
    angle: 0,
    intensity: 1,
  });

  // Draw.rect({
  //   position: { x: 0, y: 0, z: 0 },
  //   size: { width: 1920, height: 1080 },
  //   color: COLOR.WHITE,
  // });

  LIGHT_COLORS.forEach((color, index) => {
    const angle = t * 0.6 + (index / LIGHT_COLORS.length) * Math.PI * 2;
    Light.point({
      position: {
        x: 960 + Math.cos(angle) * 400,
        y: 540 + Math.sin(angle) * 250,
      },
      radius: 320,
      color,
    });
  });
  Light.rect({
    position: { x: 120, y: 120 },
    size: { width: 300, height: 180 },
    rotation: Math.sin(t) * 0.3,
    rounded: 20,
    softness: 40,
    color: [255, 230, 180, 255],
  });
  // same disc twice: emissive on the left keeps its color in the dark (3x, past white into the
  // tone map), plain on the right fades
  Draw.circle({
    position: { x: 700, y: 900, z: 0 },
    radius: 80,
    color: COLOR.RED,
    material: EMISSIVE_MATERIAL,
    params: NEON,
  });
  Draw.circle({
    position: { x: 1000, y: 900, z: 0 },
    radius: 80,
    color: [80, 255, 160, 255],
  });
  Light.ellipse({
    position: { x: 1600, y: 850 },
    size: { width: 420, height: 180 },
    softness: 90,
    color: [255, 200, 120, 255],
    intensity: 0.5 + Math.abs(Math.sin(t * 3)) * 0.5,
  });
}
