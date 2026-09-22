import { Draw } from "@/core/aurora/urp/draw/draw";
import { COLOR } from "@/core/axiom/color";
import Time from "@/core/engine/time";

export function staticObjects(t: number) {
  Draw.rect({
    position: { x: 500, y: 300, z: 0 },
    size: { width: 180, height: 180 },
    color: [255, 60, 60, 255],
    outline: { color: [55, 60, 220, 255], width: 5 },
    rounded: [24, 0, 24, 0],
    // rotation: t,
  });
  Draw.rect({
    position: { x: 550, y: 350, z: 0 },
    size: { width: 80, height: 80 },
    color: [60, 120, 255, 140],
  });
  Draw.circle({
    position: { x: 400, y: 300, z: 0 },
    radius: 60,
    color: [60, 120, 255, 140],
    outline: { width: 3, color: COLOR.WHITE },
  });
  Draw.ellipse({
    position: { x: 900, y: 300, z: 0 },
    size: { width: 220, height: 90 },
    color: [60, 255, 140, 200],
    rotation: t * 0.5,
    outline: { width: 3, color: COLOR.WHITE },
  });
  Draw.line({
    from: { x: 300, y: 600 },
    to: { x: 300 + 200, y: 600 + 100 },
    z: 0,
    width: 10,
    color: [255, 200, 60, 255],
    cap: "round",
    outline: { width: 2, color: COLOR.WHITE },
  });
  Draw.sprite({
    position: { x: 1200, y: 200, z: 0 },
    texture: "land",
    size: { width: 476, height: 476 },
    // crop: { x: 0, y: 0, width: 44, height: 44 },
    rotation: Time.getTimeInSeconds() * 0.3,
    rounded: 20,
    outline: { width: 4, color: COLOR.WHITE },
  });
}
