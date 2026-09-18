import { Draw } from "@/core/aurora2/urp/draw";
import { COLOR } from "@/core/axiom/color";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";
import Time from "@/core/engine/time";

// projection done here, Aurora only ever sees grid coordinates through sort
const TILE = { width: 140, height: 70 };
const FLOOR_HEIGHT = 50;

// color encodes the sort result, not the pillar's identity: whatever the
// sort currently places behind the character is always blue, whatever it
// places in front is always orange. A wrong sort shows up as a color on the
// wrong side of the character instead of a subtle pixel-level overlap bug.
const BEHIND: RGBA = [70, 140, 220, 255];
const BEHIND_SOFT: RGBA = [70, 140, 220, 190];
const FRONT: RGBA = [230, 120, 50, 255];
const FRONT_SOFT: RGBA = [230, 120, 50, 190];
const CHAR: RGBA = COLOR.WHITE;
const CHAR_SOFT: RGBA = [255, 255, 255, 190];

interface IsoPillar {
  gx: number;
  gy: number;
  z: number;
}

// a few tiles with pillars of different heights, some sharing a tile diagonal
const PILLARS: IsoPillar[] = [
  { gx: 0, gy: 0, z: 1 },
  { gx: 1, gy: 0, z: 3 },
  { gx: 2, gy: 0, z: 1 },
  { gx: 0, gy: 1, z: 2 },
  { gx: 2, gy: 1, z: 4 },
  { gx: 1, gy: 2, z: 2 },
  { gx: 3, gy: 2, z: 1 },
];

// WASD-driven, not auto-animated: the color must only ever change because
// the player walked somewhere, so a flip is always explained by their own move
const SPEED = 322.2; // grid units per second
const BOUNDS = { minX: -0.3, maxX: 3.3, minY: -0.3, maxY: 2.3 };
const player = { gx: 1.5, gy: 1 };

function movePlayer() {
  const dt = Time.getDeltaTime() / 1000;
  let dx = 0;
  let dy = 0;
  if (InputManager.isKeyHold(KEY.d)) dx += 1;
  if (InputManager.isKeyHold(KEY.a)) dx -= 1;
  if (InputManager.isKeyHold(KEY.s)) dy += 1;
  if (InputManager.isKeyHold(KEY.w)) dy -= 1;
  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    player.gx += (dx / length) * SPEED * dt;
    player.gy += (dy / length) * SPEED * dt;
  }
  player.gx = Math.min(BOUNDS.maxX, Math.max(BOUNDS.minX, player.gx));
  player.gy = Math.min(BOUNDS.maxY, Math.max(BOUNDS.minY, player.gy));
}

function isoToScreen(
  originX: number,
  originY: number,
  gx: number,
  gy: number,
  z: number,
) {
  return {
    x: originX + (gx - gy) * (TILE.width / 2),
    y: originY + (gx + gy) * (TILE.height / 2) - z * FLOOR_HEIGHT,
  };
}

// draws a pair in both call orders, the result must not depend on it
function drawScene(
  originX: number,
  originY: number,
  opaque: boolean,
  t: number,
) {
  const reversed = Math.floor(t / 3) % 2 === 1;
  const pillars = reversed ? [...PILLARS].reverse() : PILLARS;
  const width = TILE.width * 0.6;

  const { gx, gy } = player;
  const charDiagonal = gx + gy;

  for (const pillar of pillars) {
    const base = isoToScreen(originX, originY, pillar.gx, pillar.gy, 0);
    const top = isoToScreen(originX, originY, pillar.gx, pillar.gy, pillar.z);
    const inFront = pillar.gx + pillar.gy + pillar.z > charDiagonal;
    const color = opaque
      ? inFront
        ? FRONT
        : BEHIND
      : inFront
        ? FRONT_SOFT
        : BEHIND_SOFT;
    Draw.rect({
      position: { x: base.x - width / 2, y: top.y, z: 0 },
      size: { width, height: base.y - top.y },
      color,
      outline: { width: 3, color: COLOR.BLACK },
      sort: { x: pillar.gx, y: pillar.gy, z: pillar.z },
    });
  }

  const pos = isoToScreen(originX, originY, gx, gy, 0);
  const height = 90;
  Draw.rect({
    position: { x: pos.x - 20, y: pos.y - height, z: 0 },
    size: { width: 40, height },
    color: opaque ? CHAR : CHAR_SOFT,
    outline: { width: 3, color: COLOR.BLACK },
    sort: { x: gx, y: gy, z: 0 },
  });
}

export function isoTest(t: number) {
  movePlayer();
  // left scene opaque, right scene transparent, same stacking rules must hold in both
  drawScene(500, 200, true, t);
  drawScene(1300, 200, false, t);
}
