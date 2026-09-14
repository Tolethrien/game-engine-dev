import Engine from "@engine/engine";
import FPSOverlay from "@engine/fpsOverlay";
import { debug } from "@debug";
import Aurora from "@/core/aurora2/core";
import RenderGraph from "@/core/aurora2/renderGraph";
import ClearPass from "@/core/aurora2/passes/clear";
import PresentPass from "@/core/aurora2/passes/present";
import QuadsPass from "@/core/aurora2/passes/quads";
import GrayscalePass from "@/core/aurora2/passes/grayscale";
import GrayscaleComputePass from "@/core/aurora2/passes/grayscaleCompute";
import GpuTimer from "@/core/aurora2/timer";
async function preload() {
  await Aurora.config({
    rendering: { transparentCanvas: false, canvasColor: [255, 25, 55, 255] },
  });
  await RenderGraph.setPasses([
    new ClearPass(),
    new QuadsPass(),
    new GrayscaleComputePass(),
    new PresentPass(),
  ]);

  FPSOverlay.setVisible(true);
}
function setup() {
  debug.log.log("some data");
}
Engine.initialize({ setup, preload });
