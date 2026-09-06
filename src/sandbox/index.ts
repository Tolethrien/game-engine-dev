import Renderer from "@aurora/renderer/renderer";
import Engine from "@engine/engine";
import auroraConfig from "@aurora/renderer/config";
import FPSOverlay from "@engine/fpsOverlay";
import { debug } from "@debug";
async function preload() {
  const aurora = auroraConfig({
    userTextures: [],
    userFonts: [],
    feature: {
      bloom: true,
      lighting: true,
    },
    debugger: "minimal",
    camera: { builtInCameraInputs: false, speed: 0 },
    rendering: {
      sortOrder: "y+x+z",
      renderRes: "1920x1080", // must be in fullHD
      toneMapping: "none",
      drawOrigin: "center", // don't work - must be like this
      canvasColor: [0, 0, 0, 255],
    },
  });
  await Renderer.initialize(aurora);
  // FPSOverlay.setVisible(true);
}
function setup() {
  debug.log.log("some data");
}
Engine.initialize({ setup, preload });
