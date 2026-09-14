import { Collector, Signal } from "@axiom/events";
import { AuroraDebugData, IAuroraModule } from "../interfaces";
import { profilerState } from "../profilerState";

const REPORT_INTERVAL_MS = 1000;

export class AuroraDevModule implements IAuroraModule {
  private lastReport = 0;
  private collecting = false;
  private collector = new Collector<AuroraDebugData>();
  private collectingChanged = new Signal<boolean>();

  public connect(source: () => AuroraDebugData) {
    this.collector.connect(source);
  }

  public onCollectingChange(callback: (collecting: boolean) => void) {
    this.collectingChanged.connect(callback);
    callback(this.collecting);
  }

  public endFrame() {
    const open = profilerState.isOpen;
    if (open !== this.collecting) {
      this.collecting = open;
      this.collectingChanged.emit(open);
    }
    if (!open) return;

    const now = performance.now();
    if (now - this.lastReport < REPORT_INTERVAL_MS) return;
    this.lastReport = now;

    for (const data of this.collector.collect()) {
      // TEMPORARY: stary AuroraSnapshot, dopóki nie ma nowego panelu
      window.API.DEBUG.sendAuroraSnapshot({
        GPUTime: data.gpuTime ?? 0,
        CPUTime: 0,
        pipelineTimes: data.passTimes.map((pass) => ({
          name: pass.name,
          time: Number(pass.time.toFixed(3)),
        })),
        pipelineInUse: data.activePasses,
        drawCalls: 0,
        computeCalls: 0,
        totalCalls: 0,
        renderPasses: 0,
        computePasses: 0,
        drawnQuads: 0,
        drawnGui: 0,
        drawnLights: 0,
        drawnTriangles: 0,
        drawnVertices: 0,
        usedPostProcessing: [],
        displayedTexture: "",
        globalIllumination: [0, 0, 0],
        sortOrder: "",
        drawOrigin: "",
      });
    }
  }
}

export const prodAurora: IAuroraModule = {
  connect: () => {},
  onCollectingChange: () => {},
  endFrame: () => {},
};
