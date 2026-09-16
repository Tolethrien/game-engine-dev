import Engine from "@engine/engine";
import FPSOverlay from "@engine/fpsOverlay";
import InputManager from "@engine/inputManager";
import Time from "@engine/time";
import { KEY } from "@engine/keys";
import Aurora from "@/core/aurora2/core";
import RenderGraph from "@/core/aurora2/renderGraph";
import ClearPass from "@/core/aurora2/passes/clear";
import PresentPass from "@/core/aurora2/passes/present";
import EncodePass from "@/core/aurora2/passes/encode";
import IsoChunkPass from "@/core/aurora2/passes/isoChunk";
import land from "@sandbox/assets/land.png";

const TILE = 44;
const CHUNK = 200;
const CAMERA_SPEED = 300;
const ZOOM_SPEED = 2;
const START = { x: 0, y: (CHUNK * TILE) / 2 };

const camera = { x: START.x, y: START.y, zoom: 1 };

async function preload() {
  await Aurora.config({
    rendering: {
      transparentCanvas: false,
      canvasColor: [0, 0, 0, 255],
      renderRes: "1920x1080",
      normalMaps: false,
      heightMaps: false,
      computeGroupSize: 16,
      colorSpace: "linear",
    },

    userTextures: [{ name: "land", albedo: land }],
    userUI: [],
  });

  await RenderGraph.setPreset(() => [
    new ClearPass(),
    new IsoChunkPass({
      texture: "land",
      tileWidth: TILE,
      tileHeight: TILE,
      variants: 5,
      size: CHUNK,
    }),
    new EncodePass(),
    new PresentPass(),
  ]);
  FPSOverlay.setVisible(true);
}

function setup() {
  Aurora.setCamera({ position: camera, zoom: camera.zoom });
}

function update() {
  let dx = 0;
  let dy = 0;
  if (InputManager.isKeyHold(KEY.a)) dx -= 1;
  if (InputManager.isKeyHold(KEY.d)) dx += 1;
  if (InputManager.isKeyHold(KEY.w)) dy -= 1;
  if (InputManager.isKeyHold(KEY.s)) dy += 1;

  const step = (CAMERA_SPEED * Time.getDeltaTime()) / camera.zoom;
  camera.x += dx * step;
  camera.y += dy * step;

  const zoomStep = ZOOM_SPEED ** Time.getDeltaTime();
  if (InputManager.isKeyHold(KEY.arrowUp)) camera.zoom *= zoomStep;
  if (InputManager.isKeyHold(KEY.arrowDown)) camera.zoom /= zoomStep;

  if (InputManager.isKeyPressed(KEY.r)) {
    camera.x = START.x;
    camera.y = START.y;
    camera.zoom = 1;
  }

  Aurora.setCamera({ position: camera, zoom: camera.zoom });
}

Engine.initialize({ setup, preload, update });
