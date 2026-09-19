import Engine from "@engine/engine";
import FPSOverlay from "@engine/fpsOverlay";
import Aurora from "@/core/aurora/core";
import land from "@sandbox/assets/land.png";
import temp from "@sandbox/assets/3.jpg";
import latoRegular from "@sandbox/assets/fonts/lato/Lato-Regular.ttf";
import latoBold from "@sandbox/assets/fonts/lato/Lato-Bold.ttf";
import latoItalic from "@sandbox/assets/fonts/lato/Lato-Italic.ttf";
import medievalSharp from "@sandbox/assets/fonts/medievalSharp/MedievalSharp-Regular.ttf";
import blackOps from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.ttf";
import URP from "@/core/aurora/urp/urp";
import type { SortMode, URPSortConfig } from "@/core/aurora/urp/urpTypes";
import { COLOR } from "@/core/axiom/color";
import { setupNaviTest, updateNaviTest } from "@sandbox/tests/naviTest";
import { Draw } from "@/core/aurora/urp/draw";

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

    userTextures: [
      { name: "land", albedo: land },
      { name: "temp", albedo: temp },
    ],
    userUI: [{ name: "landUI", url: land }],
    fonts: [
      { name: "lato", type: "dynamic", url: latoRegular },
      { name: "latoBold", type: "dynamic", url: latoBold },
      { name: "latoItalic", type: "dynamic", url: latoItalic },
      { name: "medieval", type: "dynamic", url: medievalSharp },
      { name: "blackOps", type: "dynamic", url: blackOps },
    ],
  });

  await URP.init({
    sort: {
      mode: "y+x+z",
      anchor: "bottom",
      step: { y: 2, x: 32, z: 1 },
      zRange: [0, 255],
    },
  });
  FPSOverlay.setVisible(true);
}

function setup() {
  setupNaviTest();
}
function update() {
  URP.beginFrame();
  Draw.sprite({
    position: { x: 0, y: 0, z: 0 },
    size: { width: 2000, height: 1100 },
    texture: "temp",
    atlas: "world",
  });
  updateNaviTest();
}

Engine.initialize({ setup, preload, update });
