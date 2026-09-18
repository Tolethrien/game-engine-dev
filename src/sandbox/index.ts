import Engine from "@engine/engine";
import FPSOverlay from "@engine/fpsOverlay";
import Aurora from "@/core/aurora2/core";
import land from "@sandbox/assets/land.png";
import latoRegular from "@sandbox/assets/fonts/lato/Lato-Regular.ttf";
import latoBold from "@sandbox/assets/fonts/lato/Lato-Bold.ttf";
import latoItalic from "@sandbox/assets/fonts/lato/Lato-Italic.ttf";
import medievalSharp from "@sandbox/assets/fonts/medievalSharp/MedievalSharp-Regular.ttf";
import blackOps from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.ttf";
import latoSdfImage from "@sandbox/assets/fonts/lato/Lato-Regular.mtsdf.png";
import latoSdfJson from "@sandbox/assets/fonts/lato/Lato-Regular.mtsdf.json";
import blackOpsSdfImage from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.mtsdf.png";
import blackOpsSdfJson from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.mtsdf.json";
import Time from "@/core/engine/time";
import URP, { SortMode, URPSortConfig } from "@/core/aurora2/urp/urp";
import { COLOR } from "@/core/axiom/color";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";
import { pilarsTest } from "@sandbox/tests/pillars";
import { lasersTest } from "@sandbox/tests/lasers";
import { sortTest } from "@sandbox/tests/sort";
import { quadTest } from "@sandbox/tests/quad";
import { guiTest } from "@sandbox/tests/gui";
import { guiShadowTest } from "@sandbox/tests/guiShadow";
import { textWorldTest } from "@sandbox/tests/textWorld";
import { textGuiTest } from "@sandbox/tests/textGui";
import { isoTest } from "@sandbox/tests/iso";

const SORT_MODES: SortMode[] = [
  "none",
  "y",
  "layer",
  "y+x",
  "y+x+z",
  "gx+gy+z",
];
const SORT_CONFIG: URPSortConfig = {
  mode: "y+x+z",
  anchor: "bottom",
  step: { y: 2, x: 32, z: 1 },
  zRange: [0, 255],
};
// gx+gy+z sorts in grid units (fractions of a tile), not screen pixels
const ISO_STEP = { x: 1, y: 0.125, z: 1 };
let sortModeIndex = SORT_MODES.indexOf(SORT_CONFIG.mode);

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
    fonts: [
      { name: "lato", type: "dynamic", url: latoRegular },
      { name: "latoBold", type: "dynamic", url: latoBold },
      { name: "latoItalic", type: "dynamic", url: latoItalic },
      { name: "medieval", type: "dynamic", url: medievalSharp },
      { name: "blackOps", type: "dynamic", url: blackOps },
      {
        name: "latoSdf",
        type: "mtsdf",
        url: latoSdfImage,
        json: latoSdfJson,
      },
      {
        name: "blackOpsSdf",
        type: "mtsdf",
        url: blackOpsSdfImage,
        json: blackOpsSdfJson,
      },
    ],
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
    const step = mode === "gx+gy+z" ? ISO_STEP : SORT_CONFIG.step;
    void URP.init({ sort: { ...SORT_CONFIG, mode, step } });
  }
  URP.beginFrame();
  const t = Time.getTimeInSeconds();
  // pilarsTest(t);
  // lasersTest(t);
  // sortTest(t);
  // quadTest(t);
  // guiTest(t);
  guiShadowTest(t);
  // textWorldTest(t);
  // textGuiTest(t);
  // isoTest(t);
}

Engine.initialize({ setup, preload, update });
