import { Draw } from "@/core/aurora/urp/draw";
import { COLOR } from "@/core/axiom/color";
import { LASER_PULSE, PULSE_PARAMS } from "./materials";

export function quadTest(t: number) {
  // textured quad with each corner wobbling on its own
  const wobble = Math.sin(t * 3) * 40;
  Draw.quad({
    points: [
      { x: 1500 + wobble, y: 700 },
      { x: 1820, y: 700 - wobble },
      { x: 1820 - wobble, y: 1000 },
      { x: 1500, y: 1000 + wobble },
    ],
    z: 0,
    texture: "land",
    crop: { x: 0, y: 0, width: 44, height: 44 },
  });

  // trapezoid with a material, uv follows the deformed shape
  const lean = Math.cos(t * 1.5) * 60;
  Draw.quad({
    points: [
      { x: 1500 + lean, y: 480 },
      { x: 1700 + lean, y: 480 },
      { x: 1820, y: 640 },
      { x: 1400, y: 640 },
    ],
    z: 0,
    color: COLOR.HOT_PINK,
    material: LASER_PULSE,
    params: PULSE_PARAMS,
  });
}
