import { Draw, Light, Post } from "@/core/aurora/urp/draw/draw";
import { EMISSIVE_MATERIAL } from "@aurora/urp/draw/materials";

interface LedStrip {
  y: number;
  color: RGBA;
  // gap between segments, 0 = one solid tube
  gap: number;
}
const STRIPS: LedStrip[] = [
  { y: 330, color: [255, 50, 40, 255], gap: 14 },
  { y: 540, color: [255, 220, 40, 255], gap: 0 },
  { y: 750, color: [60, 255, 70, 255], gap: 0 },
];
const STRIP = { fromX: 260, toX: 1660, width: 12, segment: 46 };
const FLOOR = {
  tile: 80,
  gap: 4,
  colors: [
    [58, 58, 64, 255],
    [44, 44, 50, 255],
  ] as RGBA[],
  // behind everything: with y sorting a full screen rect sorted by its center covers all above it
  sort: { x: 0, y: 0, z: 0 },
};
// packed once, not per draw; low enough that the tube keeps its color instead of a white
// core, so it melts into the glow around it
const LED = EMISSIVE_MATERIAL.pack({ intensity: 8 });

// ambient and post are state: set once, they stay until changed
export function setupLedTest() {
  // dim enough for the tiles to stay in the dark, bright enough to see them under the glow
  Light.setAmbient({
    from: [70, 70, 80, 255],
    to: [70, 70, 80, 255],
    angle: 0,
    intensity: 1,
  });
  // no lights, the strips glow only through bloom: radius 6 leaves the tail room to fade
  // out (~100px) while the screen sized levels stay off, scatter shapes the fade within it;
  // a strong intensity makes the glow next to the tube about as bright as the tube itself
  Post.setBloom({ enabled: true, intensity: 1.5, scatter: 0.4, radius: 8 });
}
// dark room, three glowing strips; tuned for aces in URP.init
export function ledTest(t: number) {
  drawFloor();

  STRIPS.forEach((strip) => {
    if (strip.gap === 0) {
      drawTube(STRIP.fromX, STRIP.toX, strip);
      return;
    }
    const step = STRIP.segment + strip.gap;
    for (let x = STRIP.fromX; x + STRIP.segment <= STRIP.toX; x += step) {
      drawTube(x, x + STRIP.segment, strip);
    }
  });
}

// checkered tiles: a flat floor shows the strip light as a plain blurred bar,
// tiles give it something to pull out of the dark
function drawFloor() {
  const size = FLOOR.tile - FLOOR.gap;
  for (let row = 0; row * FLOOR.tile < 1080; row++) {
    for (let column = 0; column * FLOOR.tile < 1920; column++) {
      Draw.rect({
        position: { x: column * FLOOR.tile, y: row * FLOOR.tile, z: 0 },
        size: { width: size, height: size },
        rounded: 4,
        color: FLOOR.colors[(row + column) % 2],
        sort: FLOOR.sort,
      });
    }
  }
}
function drawTube(fromX: number, toX: number, strip: LedStrip) {
  Draw.line({
    from: { x: fromX, y: strip.y },
    to: { x: toX, y: strip.y },
    width: STRIP.width,
    cap: "round",
    z: 1,
    color: strip.color,
    material: EMISSIVE_MATERIAL,
    params: LED,
  });
}
