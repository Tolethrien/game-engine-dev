import Renderer from "@/core/aurora/renderer/renderer";
import Engine from "@/core/engine/engine";
import auroraConfig from "@/core/aurora/renderer/config";
async function preload() {
  const aurora = auroraConfig({
    userTextures: [],
    userFonts: [],
    feature: {
      bloom: true,
      lighting: true,
    },
    debugger: "extended",
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
}
function setup() {}
Engine.initialize({ setup, preload });
