import { Collector, Signal } from "@axiom/events";
import { AuroraDebugData, IAuroraModule } from "../interfaces";
import { profilerState } from "../profilerState";

const REPORT_INTERVAL_MS = 1000;

export class AuroraDevModule implements IAuroraModule {
  private lastReport = 0;
  private collecting = false;
  private collector = new Collector<AuroraDebugData>();
  private collectingChanged = new Signal<boolean>();
  private gpuErrors: Map<string, number> = new Map();
  public connect(source: () => AuroraDebugData) {
    this.collector.connect(source);
  }

  public watchDevice(device: GPUDevice) {
    device.lost.then((info) => {
      if (info.reason === "destroyed") return;
      console.error(`[Aurora] GPU device lost: ${info.message}`);
    });

    device.addEventListener("uncapturederror", (event) => {
      event.preventDefault();
      const message = event.error.message;
      const count = this.gpuErrors.get(message) ?? 0;
      this.gpuErrors.set(message, count + 1);
      if (count > 0) return;
      console.error(`[Aurora] WebGPU error (reported once):\n${message}`);
    });
  }
  public watchShader(label: string, module: GPUShaderModule, code: string) {
    module.getCompilationInfo().then((info) => {
      if (info.messages.length === 0) return;
      const lines = code.split("\n");
      for (const msg of info.messages) {
        const line = lines[msg.lineNum - 1] ?? "";
        const caret = " ".repeat(Math.max(0, msg.linePos - 1)) + "^";
        const text = `[${label}] ${msg.type} at ${msg.lineNum}:${msg.linePos}: ${msg.message}\n${line}\n${caret}`;
        if (msg.type === "error") console.error(text);
        else if (msg.type === "warning") console.warn(text);
        else console.info(text);
      }
    });
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
  watchDevice: () => {},
  watchShader: () => {},
};
