import { Draw, Light } from "@/core/aurora/urp/draw/draw";
import { EMISSIVE_MATERIAL } from "@aurora/urp/draw/materials";
import type { MaterialParams } from "@aurora/urp/draw/drawTypes";
import Aurora from "@aurora/core";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";
import Time from "@/core/engine/time";
import SeededRandom from "@axiom/seedRandom";
import AxiomMath from "@axiom/math";
import foliageSprites from "@sandbox/assets/foliageSprites.json";

type FoliageName = keyof typeof foliageSprites;
interface WorldSprite {
  texture: string;
  crop: Crop;
  position: Position3D;
  sort: Position3D;
}
interface Torch {
  // tile center: the light sits here, the post stands on it
  base: Position2D;
  // own copy, its intensity changes every frame
  params: MaterialParams;
  // flicker phase, so torches never pulse together
  phase: number;
}
// world objects in paint order: a sprite or a torch
type WorldObject = { sprite: WorldSprite } | { torch: Torch };
interface Plant {
  // sprites stacked on one tile, drawn in this order (trunk before its leaves)
  layers: (FoliageName | null)[][];
  weight: number;
}

// 44x44 diamonds like Ultima Online: one grid step moves half a tile on both screen axes
const TILE = { size: 44, half: 22 };
const MAP = { size: 60, seed: 1337 };
// the four grass variants of land.png, side by side in the top row
const GRASS = { texture: "land", variants: 4 };
// each layer lists what may be drawn there, null = nothing; "none" keeps most tiles empty
const PLANTS: Record<string, Plant> = {
  none: { layers: [], weight: 80 },
  tree: {
    layers: [
      ["oak_tree"],
      ["oak_tree_leaf_spring", "oak_tree_leaf_fall", null],
    ],
    weight: 5,
  },
  bush: { layers: [["bush_purple"]], weight: 5 },
  flower: { layers: [["flower_orange"]], weight: 7 },
  mushrooms: { layers: [["mushrooms"]], weight: 3 },
};
// glowing posts half a tile wide and about half a tree tall, lighting the grass around them
const TORCH = {
  chance: 0.015,
  width: TILE.half,
  height: 76,
  color: [255, 150, 60, 255] as RGBA,
  // emissive intensity: over 1 so bloom picks the post up
  glow: 2,
  light: { radius: 120, intensity: 0.7, falloff: 2 },
  // flicker: share of the brightness it wobbles by, and how fast
  flicker: { amount: 0.15, speed: 9 },
};
// night, so the torches carry the scene
const AMBIENT = { color: [45, 55, 95, 255] as RGBA, intensity: 1 };
// zoomSpeed: zoom doubles every this many seconds of holding an arrow
const CAMERA = { speed: 300, zoomSpeed: 1, minZoom: 0.4, maxZoom: 3 };
// ground behind everything: every tile shares the lowest sort point
const GROUND_SORT: Position3D = { x: 0, y: 0, z: 0 };

const world = buildWorld();
const camera = { center: mapCenter(), zoom: 1 };

// ambient is state, set once
export function setupIsoWorld() {
  // Light.setAmbient({
  //   from: AMBIENT.color,
  //   to: AMBIENT.color,
  //   angle: 0,
  //   intensity: AMBIENT.intensity,
  // });
}
// grass map with foliage and torches, the base scene for the post effects;
// WASD pans, up/down arrows zoom
export function isoWorldTest(t: number) {
  moveCamera();
  for (const tile of world.ground) Draw.sprite(tile);
  for (const object of world.objects) {
    if ("sprite" in object) Draw.sprite(object.sprite);
    else drawTorch(object.torch, t);
  }
}

function drawTorch(torch: Torch, t: number) {
  // const { flicker } = TORCH;
  // // two sines at unrelated speeds read as a flame, one alone as a pulse
  // const wobble =
  //   Math.sin(t * flicker.speed + torch.phase) * 0.6 +
  //   Math.sin(t * flicker.speed * 2.3 + torch.phase * 1.7) * 0.4;
  // const brightness = 1 + wobble * flicker.amount;
  // torch.params[0] = TORCH.glow * brightness;
  // Draw.rect({
  //   position: {
  //     x: torch.base.x - TORCH.width / 2,
  //     y: torch.base.y - TORCH.height,
  //     z: 0,
  //   },
  //   size: { width: TORCH.width, height: TORCH.height },
  //   color: TORCH.color,
  //   material: EMISSIVE_MATERIAL,
  //   params: torch.params,
  //   sort: { x: torch.base.x, y: torch.base.y, z: 0 },
  // });
  // Light.point({
  //   position: { x: torch.base.x, y: torch.base.y - TORCH.height / 2 },
  //   radius: TORCH.light.radius,
  //   color: TORCH.color,
  //   intensity: TORCH.light.intensity * brightness,
  //   falloff: TORCH.light.falloff,
  // });
}

function buildWorld() {
  const random = new SeededRandom(MAP.seed);
  const plants = Object.values(PLANTS);
  const weights = plants.map((plant) => plant.weight);
  const ground: WorldSprite[] = [];
  const objects: WorldObject[] = [];

  // diagonal by diagonal from the back, so call order alone paints back to front
  for (let diagonal = 0; diagonal <= (MAP.size - 1) * 2; diagonal++) {
    const firstColumn = Math.max(0, diagonal - MAP.size + 1);
    const lastColumn = Math.min(diagonal, MAP.size - 1);
    for (let column = firstColumn; column <= lastColumn; column++) {
      const row = diagonal - column;
      const center = tileCenter(column, row);
      ground.push({
        texture: GRASS.texture,
        crop: {
          x: random.int(0, GRASS.variants - 1) * TILE.size,
          y: 0,
          width: TILE.size,
          height: TILE.size,
        },
        position: { x: center.x - TILE.half, y: center.y - TILE.half, z: 0 },
        sort: GROUND_SORT,
      });

      if (random.bool(TORCH.chance)) {
        objects.push({
          torch: {
            base: center,
            params: EMISSIVE_MATERIAL.pack(),
            phase: random.float(0, Math.PI * 2),
          },
        });
        continue;
      }
      const plant = random.weightedRandom(plants, weights);
      for (const options of plant.layers) {
        const name = options[random.int(0, options.length - 1)];
        if (name !== null)
          objects.push({ sprite: foliageSprite(name, center) });
      }
    }
  }
  return { ground, objects };
}

// assumed anchor: the bottom center of the crop sits on the tile center, shifted by offset
function foliageSprite(name: FoliageName, center: Position2D): WorldSprite {
  const { sheet, crop, offset } = foliageSprites[name];
  return {
    texture: sheet,
    crop,
    position: {
      x: center.x + offset.x - crop.width / 2,
      y: center.y + offset.y - crop.height,
      z: 0,
    },
    // the tile center, not the sprite bounds: a tall tree still sorts by where it stands
    sort: { x: center.x, y: center.y, z: 0 },
  };
}

// world x starts at 0 on the left corner of the map
function tileCenter(column: number, row: number): Position2D {
  return {
    x: (column - row + MAP.size) * TILE.half,
    y: (column + row + 1) * TILE.half,
  };
}
function mapCenter(): Position2D {
  return { x: MAP.size * TILE.half, y: MAP.size * TILE.half };
}

function moveCamera() {
  let right = 0;
  let down = 0;
  if (InputManager.isKeyHold(KEY.d)) right += 1;
  if (InputManager.isKeyHold(KEY.a)) right -= 1;
  if (InputManager.isKeyHold(KEY.s)) down += 1;
  if (InputManager.isKeyHold(KEY.w)) down -= 1;
  // screen speed stays the same at any zoom
  const step = (CAMERA.speed * Time.getRawDeltaTime()) / camera.zoom;
  camera.center.x += right * step;
  camera.center.y += down * step;

  let zoomIn = 0;
  if (InputManager.isKeyHold(KEY.arrowUp)) zoomIn += 1;
  if (InputManager.isKeyHold(KEY.arrowDown)) zoomIn -= 1;
  if (zoomIn !== 0) {
    // exponential, so zooming feels as fast close up as far away
    const factor = 2 ** ((zoomIn * Time.getRawDeltaTime()) / CAMERA.zoomSpeed);
    camera.zoom = AxiomMath.clamp(
      camera.zoom * factor,
      CAMERA.minZoom,
      CAMERA.maxZoom,
    );
  }

  // the shader zooms around position + half the render, so that point is the view center
  const view = Aurora.getRenderSize;
  Aurora.setCamera({
    position: {
      x: camera.center.x - view.width / 2,
      y: camera.center.y - view.height / 2,
    },
    zoom: camera.zoom,
  });
}
