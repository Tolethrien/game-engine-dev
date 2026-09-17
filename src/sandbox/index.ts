import Engine from "@engine/engine";
import FPSOverlay from "@engine/fpsOverlay";
import Aurora from "@/core/aurora2/core";
import land from "@sandbox/assets/land.png";
import { Draw, DrawGui } from "@/core/aurora2/urp/draw";
import Time from "@/core/engine/time";
import URP, { SortMode, URPSortConfig } from "@/core/aurora2/urp/urp";
import Material from "@/core/aurora2/material";
import { MaterialParams } from "@/core/aurora2/urp/draw";
import { COLOR } from "@/core/axiom/color";
import AxiomMath from "@axiom/math";
import laserElectric from "@/core/aurora2/urp/shaders/materials/laserElectric.wgsl?raw";
import laserPulse from "@/core/aurora2/urp/shaders/materials/laserPulse.wgsl?raw";
import laserPlasma from "@/core/aurora2/urp/shaders/materials/laserPlasma.wgsl?raw";
import laserTracer from "@/core/aurora2/urp/shaders/materials/laserTracer.wgsl?raw";
import glowOrb from "@/core/aurora2/urp/shaders/materials/glowOrb.wgsl?raw";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";

// params: x = intensity, y = speed, z = effect specific, w = seed
const LASER_ELECTRIC = Material.create({
  name: "laserElectric",
  blend: "additive",
  fragment: laserElectric,
});
const LASER_PULSE = Material.create({
  name: "laserPulse",
  blend: "additive",
  fragment: laserPulse,
});
const LASER_PLASMA = Material.create({
  name: "laserPlasma",
  blend: "additive",
  fragment: laserPlasma,
});
const LASER_TRACER = Material.create({
  name: "laserTracer",
  blend: "additive",
  fragment: laserTracer,
});
const GLOW_ORB = Material.create({
  name: "glowOrb",
  blend: "additive",
  fragment: glowOrb,
});

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
const PULSE_PARAMS: MaterialParams = [1.3, 1.5, 90, 0];
const PLASMA_PARAMS: MaterialParams = [1.0, 1.0, 0, 2.0];
const SORT_MODES: SortMode[] = ["none", "y", "layer", "y+x", "y+x+z"];
const SORT_CONFIG: URPSortConfig = {
  mode: "y+x+z",
  anchor: "bottom",
  step: { y: 2, x: 32, z: 1 },
  zRange: [0, 255],
};
let sortModeIndex = SORT_MODES.indexOf(SORT_CONFIG.mode);
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
// soft copies for the transparent row of the sort test
const SOFT_RED: RGBA = [220, 20, 60, 200];
const SOFT_BLUE: RGBA = [30, 144, 255, 200];
const SOFT_GREEN: RGBA = [50, 205, 50, 200];
const SOFT_CYAN: RGBA = [0, 255, 255, 170];

// center x, bottom, width, height, z, color
type SortBox = [number, number, number, number, number, RGBA];
// no scrolling, one dash as long as the bullet: bright head, fading tail
const BULLET_PARAMS: MaterialParams = [1.4, 0, BULLET_LENGTH, 0];
const bullets: Bullet[] = [];
let bulletTimer = 0;
const ORB_CENTER: MaterialParams = [1.2, 3.0, 0, 0];
const ORB_SMALL: MaterialParams = [1.0, 5.0, 0, 1.5];
const PILLARS = [
  { x: 260, bottom: 420, color: [200, 70, 70, 255] as RGBA },
  { x: 520, bottom: 560, color: [70, 170, 90, 255] as RGBA },
  { x: 780, bottom: 700, color: [70, 110, 210, 255] as RGBA },
  { x: 1040, bottom: 840, color: [210, 170, 60, 255] as RGBA },
  { x: 1300, bottom: 980, color: [160, 80, 200, 255] as RGBA },
];
const PILLAR_WIDTH = 160;
const PILLAR_HEIGHT = 360;

async function preload() {
  await Aurora.config({
    rendering: {
      transparentCanvas: false,
      canvasColor: COLOR.BLACK,
      renderRes: "1920x1080",
      normalMaps: false,
      heightMaps: false,
      computeGroupSize: 16,
      colorSpace: "linear",
    },

    userTextures: [{ name: "land", albedo: land }],
    userUI: [{ name: "landUI", url: land }],
  });

  await URP.init({ sort: SORT_CONFIG });
  FPSOverlay.setVisible(true);
}

function setup() {}
function update() {
  if (InputManager.isKeyPressed(KEY.m)) {
    sortModeIndex = (sortModeIndex + 1) % SORT_MODES.length;
    const mode = SORT_MODES[sortModeIndex];
    console.log(`sort mode: ${mode}`);
    void URP.init({ sort: { ...SORT_CONFIG, mode } });
  }
  Draw.beginFrame();
  DrawGui.beginFrame();
  const t = Time.getTimeInSeconds();
  pilarsTest(t);
  lasersTest(t);
  sortTest(t);
  quadTest(t);
  guiTest(t);
}

function guiTest(t: number) {
  // canvas pixels, ignores the camera, always on top of the world
  DrawGui.rect({
    position: { x: 24, y: 24, z: 0 },
    size: { width: 320, height: 120 },
    color: [20, 20, 30, 200],
    rounded: 12,
    outline: { width: 2, color: COLOR.SKY_BLUE },
  });
  const fill = (Math.sin(t) + 1) / 2;
  DrawGui.rect({
    position: { x: 44, y: 100, z: 0 },
    size: { width: 280 * fill, height: 20 },
    color: COLOR.LIME,
    rounded: 6,
  });
  DrawGui.circle({
    position: { x: 290, y: 60, z: 0 },
    radius: 22,
    color: COLOR.GOLD,
    material: GLOW_ORB,
    params: ORB_SMALL,
  });
  DrawGui.sprite({
    position: { x: 24, y: 170, z: 0 },
    texture: "landUI",
    size: { width: 176, height: 176 },
    crop: { x: 0, y: 0, width: 44, height: 44 },
    outline: { width: 2, color: COLOR.SKY_BLUE },
  });

  // gui sprite from userTextures, same image taken from the world atlas
  DrawGui.sprite({
    position: { x: 224, y: 170, z: 0 },
    texture: "land",
    atlas: "world",
    size: { width: 176, height: 176 },
    crop: { x: 44, y: 0, width: 44, height: 44 },
    rotation: t * 0.5,
    outline: { width: 2, color: COLOR.GOLD },
  });
}

function quadTest(t: number) {
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

function lasersTest(t: number) {
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

function pilarsTest(t: number) {
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
function staticObjects() {
  Draw.beginFrame();
  const t = Time.getTimeInSeconds();
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
function sortBox([centerX, bottom, width, height, z, color]: SortBox) {
  Draw.rect({
    position: { x: centerX - width / 2, y: bottom - height, z },
    size: { width, height },
    color,
    outline: { width: 3, color: COLOR.BLACK },
  });
}

// draws a pair in both call orders, the result must not depend on it
function sortPair(swap: boolean, first: SortBox, second: SortBox) {
  if (swap) {
    sortBox(second);
    sortBox(first);
  } else {
    sortBox(first);
    sortBox(second);
  }
}

function sortTest(t: number) {
  const zSwap = Math.floor(t) % 2 === 1;
  const orderSwap = Math.floor(t / 3) % 2 === 1;

  // top row opaque, bottom row transparent, same rules must hold in both
  for (let row = 0; row < 2; row++) {
    const opaque = row === 0;
    const bottom = 380 + row * 460;
    const red = opaque ? COLOR.CRIMSON : SOFT_RED;
    const blue = opaque ? COLOR.DODGER_BLUE : SOFT_BLUE;
    const green = opaque ? COLOR.LIME : SOFT_GREEN;

    // 1. same sort point: only z decides, it swaps every second
    sortPair(
      orderSwap,
      [220, bottom, 220, 140, zSwap ? 1 : 0, red],
      [220, bottom, 110, 260, zSwap ? 0 : 1, blue],
    );

    // 2. same y: x decides, the left one has bigger z on purpose
    sortPair(
      orderSwap,
      [580, bottom, 160, 220, 9, red],
      [680, bottom, 160, 220, 0, blue],
    );

    // 3. y decides, the upper one has bigger x and z on purpose
    sortPair(
      orderSwap,
      [1000, bottom + 40, 160, 220, 0, green],
      [1080, bottom, 160, 260, 9, blue],
    );
  }

  // 4. opaque square and transparent circle on the same sort point,
  //    the circle z swaps: above the square or hidden behind it
  sortBox([1560, 380, 200, 200, 1, COLOR.GOLD]);
  Draw.circle({
    position: { x: 1560, y: 380 - 130, z: zSwap ? 2 : 0 },
    radius: 130,
    color: SOFT_CYAN,
  });
}

Engine.initialize({ setup, preload, update });
