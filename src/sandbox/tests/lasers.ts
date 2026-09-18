import { Draw } from "@/core/aurora2/urp/draw";
import { MaterialParams } from "@/core/aurora2/urp/draw";
import { COLOR } from "@/core/axiom/color";
import AxiomMath from "@axiom/math";
import Time from "@/core/engine/time";
import {
  LASER_ELECTRIC,
  LASER_PULSE,
  LASER_PLASMA,
  LASER_TRACER,
  GLOW_ORB,
  PULSE_PARAMS,
  PLASMA_PARAMS,
  ORB_CENTER,
  ORB_SMALL,
} from "./materials";

const FAN_COLORS: RGBA[] = [
  COLOR.CYAN,
  COLOR.MAGENTA,
  COLOR.GOLD,
  COLOR.LIME,
  COLOR.DODGER_BLUE,
  COLOR.HOT_PINK,
];
const FAN_PARAMS: MaterialParams[] = FAN_COLORS.map((_, i) => [
  1.1,
  0.8 + i * 0.35,
  0,
  i * 3.7,
]);

interface Bullet {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  color: RGBA;
}
const BULLET_ORIGIN = { x: 960, y: 1080, z: 0 };
const BULLET_LENGTH = 140;
const BULLET_RATE = 14;
const BULLET_COLORS: RGBA[] = [
  COLOR.CRIMSON,
  COLOR.AQUAMARINE,
  COLOR.GOLD,
  COLOR.HOT_PINK,
  COLOR.CYAN,
];
// no scrolling, one dash as long as the bullet: bright head, fading tail
const BULLET_PARAMS: MaterialParams = [1.4, 0, BULLET_LENGTH, 0];
const bullets: Bullet[] = [];
let bulletTimer = 0;

export function lasersTest(t: number) {
  const center = { x: 960, y: 540, z: 0 };

  // rotating fan of electric lasers
  for (let i = 0; i < FAN_COLORS.length; i++) {
    const angle = t * 0.4 + (i / FAN_COLORS.length) * Math.PI * 2;
    const length = 620 + Math.sin(t * 1.3 + i) * 80;
    Draw.line({
      from: center,
      to: {
        x: center.x + Math.cos(angle) * length,
        y: center.y + Math.sin(angle) * length,
      },
      z: 0,
      width: 44,
      color: FAN_COLORS[i],
      cap: "round",
      material: LASER_ELECTRIC,
      params: FAN_PARAMS[i],
    });
  }
  Draw.circle({
    position: center,
    radius: 110,
    color: COLOR.CYAN,
    material: GLOW_ORB,
    params: ORB_CENTER,
  });

  // pulse beam across the top, between two emitters
  const pulseFrom = { x: 90, y: 110, z: 0 };
  const pulseTo = { x: 1830, y: 110, z: 0 };
  Draw.line({
    from: pulseFrom,
    to: pulseTo,
    z: 0,
    width: 34,
    color: COLOR.DARK_ORANGE,
    cap: "round",
    material: LASER_PULSE,
    params: PULSE_PARAMS,
  });
  for (const point of [pulseFrom, pulseTo]) {
    Draw.circle({
      position: point,
      radius: 45,
      color: COLOR.ORANGE,
      material: GLOW_ORB,
      params: ORB_SMALL,
    });
  }

  // thick plasma beam, swaying diagonal
  Draw.line({
    from: { x: 140, y: 900 + Math.sin(t * 0.7) * 60 },
    to: { x: 1780, y: 640 + Math.cos(t * 0.5) * 90 },
    z: 0,
    width: 90,
    color: COLOR.VIOLET,
    cap: "round",
    material: LASER_PLASMA,
    params: PLASMA_PARAMS,
  });

  // bullets fired from the bottom center in random directions
  const delta = Time.getDeltaTime();
  bulletTimer += delta;
  while (bulletTimer >= 1 / BULLET_RATE) {
    bulletTimer -= 1 / BULLET_RATE;
    const angle = AxiomMath.randomFloat(-Math.PI * 0.9, -Math.PI * 0.1);
    bullets.push({
      x: BULLET_ORIGIN.x,
      y: BULLET_ORIGIN.y,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      speed: AxiomMath.randomFloat(700, 1400),
      color: BULLET_COLORS[AxiomMath.randomInt(0, BULLET_COLORS.length - 1)],
    });
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.dirX * bullet.speed * delta;
    bullet.y += bullet.dirY * bullet.speed * delta;
    const gone =
      bullet.y < -BULLET_LENGTH ||
      bullet.x < -BULLET_LENGTH ||
      bullet.x > 1920 + BULLET_LENGTH;
    if (gone) {
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
      continue;
    }
    Draw.line({
      from: {
        x: bullet.x - bullet.dirX * BULLET_LENGTH,
        y: bullet.y - bullet.dirY * BULLET_LENGTH,
      },
      to: bullet,
      z: 0,
      width: 22,
      color: bullet.color,
      material: LASER_TRACER,
      params: BULLET_PARAMS,
    });
  }
  Draw.circle({
    position: BULLET_ORIGIN,
    radius: 60,
    color: COLOR.GOLD,
    material: GLOW_ORB,
    params: ORB_SMALL,
  });
}
