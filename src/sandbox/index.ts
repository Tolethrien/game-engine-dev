import Engine from "@engine/engine";
import FPSOverlay from "@engine/fpsOverlay";
import Aurora from "@/core/aurora/core";
import land from "@sandbox/assets/land.png";
import foliage from "@sandbox/assets/foliage.png";
import temp from "@sandbox/assets/3.jpg";
import latoRegular from "@sandbox/assets/fonts/lato/Lato-Regular.ttf";
import latoBold from "@sandbox/assets/fonts/lato/Lato-Bold.ttf";
import latoItalic from "@sandbox/assets/fonts/lato/Lato-Italic.ttf";
import medievalSharp from "@sandbox/assets/fonts/medievalSharp/MedievalSharp-Regular.ttf";
import blackOps from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.ttf";
import { COLOR } from "@/core/axiom/color";
import { setupNaviTest, updateNaviTest } from "@sandbox/tests/naviTest";
import { Draw, DrawGui } from "@/core/aurora/urp/draw/draw";
import URP from "@/core/aurora/urp/urp";
import Time from "@/core/engine/time";
import latoSdfPng from "@sandbox/assets/fonts/lato/Lato-Regular.mtsdf.png";
import latoSdfJson from "@sandbox/assets/fonts/lato/Lato-Regular.mtsdf.json";
import blackOpsSdfPng from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.mtsdf.png";
import blackOpsSdfJson from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.mtsdf.json";
import { textWorldTest } from "./tests/textWorld";
import { clipTest } from "./tests/clip";
import { guiTest } from "./tests/gui";
import { guiBackdropTest } from "./tests/guiBackdrop";
import { guiShadowTest } from "./tests/guiShadow";
import { lasersTest } from "./tests/lasers";
import { pilarsTest } from "./tests/pillars";
import { quadTest } from "./tests/quad";
import { sortTest } from "./tests/sort";
import { staticObjects } from "./tests/staticShapes";
import { textGuiTest } from "./tests/textGui";
import { lightsTest } from "./tests/lights";
import { ledTest, setupLedTest } from "./tests/leds";
import { postColorTest } from "./tests/postColor";
import { postEffectsTest } from "./tests/postEffects";
import { isoWorldTest, setupIsoWorld } from "./tests/isoWorld";
import { dayNightTest } from "./tests/dayNight";
import { diffusionTest } from "./tests/diffusion";
import { screenEffectsTest } from "./tests/screenEffects";
import { captureTest, setupCaptureTest } from "./tests/captureTest";
import { setupWatchTest, watchTest } from "./tests/watchTest";
import { setupWatchLiveTest, watchLiveTest } from "./tests/watchLiveTest";
import { setupCommandTest } from "./tests/commandTest";
import ResourcePool from "@/core/aurora/resourcePool";
async function preload() {
  await Aurora.config({
    rendering: {
      transparentCanvas: false,
      canvasColor: COLOR.GRAY,
      renderRes: "1920x1080",
      normalMaps: false,
      heightMaps: false,
      computeGroupSize: 16,
      colorSpace: "linear",
    },

    userTextures: [
      { name: "land", albedo: land },
      { name: "temp", albedo: temp },
      { name: "foliage", albedo: foliage },
    ],
    userUI: [{ name: "landUI", url: land }],
    fonts: [
      { name: "lato", type: "dynamic", url: latoRegular },
      { name: "latoBold", type: "dynamic", url: latoBold },
      { name: "latoItalic", type: "dynamic", url: latoItalic },
      { name: "medieval", type: "dynamic", url: medievalSharp },
      { name: "blackOps", type: "dynamic", url: blackOps },
      { name: "latoSdf", type: "mtsdf", url: latoSdfPng, json: latoSdfJson },
      {
        name: "blackOpsSdf",
        type: "mtsdf",
        url: blackOpsSdfPng,
        json: blackOpsSdfJson,
      },
    ],
  });

  // await URP.init({
  //   sort: {
  //     mode: "y+x+z",
  //     anchor: "bottom",
  //     step: { y: 2, x: 32, z: 1 },
  //     zRange: [0, 255],
  //   },
  // });

  await URP.init({
    sortMode: "y+x+z",
    sortAnchor: "center",
    // "none" | "reinhard" | "aces" | "filmic" | "agx"
    toneMapping: { mode: "none", exposure: 0, look: "none" },
    // live: Post.setBloom({...}), Post.setExposure(stops)
    bloom: { enabled: false },
  });
  FPSOverlay.setVisible(true);
}

function setup() {
  // setupNaviTest();
  // setupCaptureTest();
  // setupWatchTest();
  // setupWatchLiveTest();
  // setupCommandTest();
  // setupLedTest();
  setupIsoWorld();
}
function update() {
  const t = Time.getTimeInSeconds();
  // background photo for lightsTest, it would cover the black led room
  // Draw.sprite({
  //   position: { x: 0, y: 0, z: 0 },
  //   texture: "temp",
  //   tint: COLOR.WHITE,
  // });

  // base scene for the post effects, always on
  isoWorldTest(t);
  dayNightTest();
  diffusionTest();
  screenEffectsTest();

  // lightsTest(t);
  // ledTest(t);
  // postColorTest(t);
  // postEffectsTest(t);

  // clipTest(t);
  // guiTest(t);
  // updateNaviTest();
  // captureTest();
  // watchTest();
  // watchLiveTest();
  // guiBackdropTest(t);
  // guiShadowTest(t);
  // lasersTest(t);
  // pilarsTest(t);
  // quadTest(t);
  // sortTest(t);
  // staticObjects(t);
  // textWorldTest(t);
  // textGuiTest(t);/

  // updateNaviTest();
}

Engine.initialize({ setup, preload, update });
