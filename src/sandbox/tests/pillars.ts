import { Draw } from "@/core/aurora/urp/draw/draw";
import { COLOR } from "@/core/axiom/color";

const PILLARS = [
  { x: 260, bottom: 420, color: [200, 70, 70, 255] as RGBA },
  { x: 520, bottom: 560, color: [70, 170, 90, 255] as RGBA },
  { x: 780, bottom: 700, color: [70, 110, 210, 255] as RGBA },
  { x: 1040, bottom: 840, color: [210, 170, 60, 255] as RGBA },
  { x: 1300, bottom: 980, color: [160, 80, 200, 255] as RGBA },
];
const PILLAR_WIDTH = 160;
const PILLAR_HEIGHT = 360;

export function pilarsTest(t: number) {
  // moving objects first, sorting must still place them correctly

  // opaque block going up and down through every pillar
  const blockBottom = 700 + Math.sin(t * 0.8) * 320;
  Draw.rect({
    position: { x: 170 + ((t * 180) % 1300), y: blockBottom - 120, z: 0 },
    size: { width: 140, height: 120 },
    color: [240, 240, 240, 255],
    outline: { width: 6, color: [20, 20, 20, 140] },
    rounded: 16,
  });

  // transparent ball crossing the pillars horizontally
  Draw.circle({
    position: { x: 200 + ((Math.sin(t * 0.5) + 1) / 2) * 1300, y: 640, z: 0 },
    radius: 70,
    color: [80, 220, 255, 130],
    outline: { width: 4, color: [255, 255, 255, 220] },
  });

  // hollow frame: only an outline, always transparent
  Draw.rect({
    position: {
      x: 900 + Math.cos(t) * 500,
      y: 520 + Math.sin(t * 1.3) * 250,
      z: 0,
    },
    size: { width: 180, height: 110 },
    color: COLOR.TRANSPARENT,
    outline: { width: 8, color: [255, 120, 40, 255] },
    rotation: t * 0.7,
  });

  // rotating stick, sort point follows its lowest end
  const stickPivot = { x: 1250, y: 760 };
  Draw.line({
    from: stickPivot,
    to: {
      x: stickPivot.x + Math.cos(t) * 300,
      y: stickPivot.y + Math.sin(t) * 300,
    },
    z: 0,
    width: 18,
    color: [255, 230, 90, 255],
    cap: "round",
  });

  // static pillars, call order flips every second
  const reversed = Math.floor(t) % 2 === 1;
  for (let i = 0; i < PILLARS.length; i++) {
    const pillar = PILLARS[reversed ? PILLARS.length - 1 - i : i];
    Draw.rect({
      position: { x: pillar.x, y: pillar.bottom - PILLAR_HEIGHT, z: 0 },
      size: { width: PILLAR_WIDTH, height: PILLAR_HEIGHT },
      color: pillar.color,
      outline: { width: 5, color: COLOR.BLACK },
    });
  }

  // ground line under each pillar, shows where its sort point is
  for (const pillar of PILLARS) {
    Draw.line({
      from: { x: pillar.x - 40, y: pillar.bottom },
      to: { x: pillar.x + PILLAR_WIDTH + 40, y: pillar.bottom },
      z: 0,
      width: 2,
      color: [255, 255, 255, 60],
    });
  }
}
