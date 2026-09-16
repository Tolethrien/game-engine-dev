import { Collector, Signal } from "@axiom/events";
import {
  AuroraCounters,
  AuroraDebugData,
  IAuroraModule,
} from "../interfaces";
import { profilerState } from "../profilerState";

const REPORT_INTERVAL_MS = 1000;

interface FrameCounts {
  drawCalls: number;
  computeCalls: number;
  renderPasses: number;
  computePasses: number;
  clearPasses: number;
  instances: number;
  vertices: number;
  triangles: number;
}

export class AuroraDevModule implements IAuroraModule {
  private lastReport = 0;
  private collecting = false;
  private collector = new Collector<AuroraDebugData>();
  private collectingChanged = new Signal<boolean>();
  private gpuErrors: Map<string, number> = new Map();
  private topologies: WeakMap<GPURenderPipeline, GPUPrimitiveTopology> =
    new WeakMap();
  private counters: Map<string, AuroraCounters> = new Map();
  private frame: FrameCounts = {
    drawCalls: 0,
    computeCalls: 0,
    renderPasses: 0,
    computePasses: 0,
    clearPasses: 0,
    instances: 0,
    vertices: 0,
    triangles: 0,
  };

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
  public watchPipeline(
    pipeline: GPURenderPipeline,
    topology: GPUPrimitiveTopology,
  ) {
    this.topologies.set(pipeline, topology);
  }

  // counting wrappers exist only while the profiler is open
  public watchRender(encoder: GPURenderPassEncoder) {
    if (!this.collecting) return encoder;
    const frame = this.frame;
    frame.renderPasses++;

    let topology: GPUPrimitiveTopology = "triangle-list";
    const setPipeline = encoder.setPipeline.bind(encoder);
    const draw = encoder.draw.bind(encoder);
    const drawIndexed = encoder.drawIndexed.bind(encoder);
    const drawIndirect = encoder.drawIndirect.bind(encoder);
    const drawIndexedIndirect = encoder.drawIndexedIndirect.bind(encoder);

    encoder.setPipeline = (pipeline) => {
      topology = this.topologies.get(pipeline) ?? "triangle-list";
      setPipeline(pipeline);
    };
    encoder.draw = (
      vertexCount,
      instanceCount = 1,
      firstVertex,
      firstInstance,
    ) => {
      this.countDraw(topology, vertexCount, instanceCount);
      draw(vertexCount, instanceCount, firstVertex, firstInstance);
    };
    encoder.drawIndexed = (
      indexCount,
      instanceCount = 1,
      firstIndex,
      baseVertex,
      firstInstance,
    ) => {
      this.countDraw(topology, indexCount, instanceCount);
      drawIndexed(
        indexCount,
        instanceCount,
        firstIndex,
        baseVertex,
        firstInstance,
      );
    };
    // indirect counts live on the GPU, only the call is known
    encoder.drawIndirect = (buffer, offset) => {
      frame.drawCalls++;
      drawIndirect(buffer, offset);
    };
    encoder.drawIndexedIndirect = (buffer, offset) => {
      frame.drawCalls++;
      drawIndexedIndirect(buffer, offset);
    };
    return encoder;
  }
  public watchCompute(encoder: GPUComputePassEncoder) {
    if (!this.collecting) return encoder;
    const frame = this.frame;
    frame.computePasses++;

    const dispatch = encoder.dispatchWorkgroups.bind(encoder);
    const dispatchIndirect = encoder.dispatchWorkgroupsIndirect.bind(encoder);
    encoder.dispatchWorkgroups = (x, y, z) => {
      frame.computeCalls++;
      dispatch(x, y, z);
    };
    encoder.dispatchWorkgroupsIndirect = (buffer, offset) => {
      frame.computeCalls++;
      dispatchIndirect(buffer, offset);
    };
    return encoder;
  }
  public watchClear() {
    if (this.collecting) this.frame.clearPasses++;
  }

  public connectCounters(name: string, source: AuroraCounters) {
    this.counters.set(name, source);
  }
  public disconnectCounters(name: string, source: AuroraCounters) {
    if (this.counters.get(name) === source) this.counters.delete(name);
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
    if (open) this.report();
    this.resetFrame();
  }

  private report() {
    const now = performance.now();
    if (now - this.lastReport < REPORT_INTERVAL_MS) return;
    this.lastReport = now;

    const frame = this.frame;
    const counters: Record<string, Record<string, number>> = {};
    this.counters.forEach((source, name) => (counters[name] = source()));

    for (const data of this.collector.collect()) {
      window.API.DEBUG.sendAuroraSnapshot({
        GPUTime: data.gpuTime ?? 0,
        CPUTime: 0,
        pipelineTimes: data.passTimes.map((pass) => ({
          name: pass.name,
          time: Number(pass.time.toFixed(3)),
        })),
        pipelineInUse: data.activePasses,
        drawCalls: frame.drawCalls,
        computeCalls: frame.computeCalls,
        totalCalls: frame.drawCalls + frame.computeCalls,
        renderPasses: frame.renderPasses,
        computePasses: frame.computePasses,
        clearPasses: frame.clearPasses,
        instances: frame.instances,
        vertices: frame.vertices,
        triangles: frame.triangles,
        textures: data.textures,
        counters,
      });
    }
  }

  private countDraw(
    topology: GPUPrimitiveTopology,
    vertexCount: number,
    instanceCount: number,
  ) {
    const frame = this.frame;
    frame.drawCalls++;
    frame.instances += instanceCount;
    frame.vertices += vertexCount * instanceCount;
    if (topology === "triangle-list") {
      frame.triangles += Math.floor(vertexCount / 3) * instanceCount;
    } else if (topology === "triangle-strip") {
      frame.triangles += Math.max(0, vertexCount - 2) * instanceCount;
    }
  }

  private resetFrame() {
    const frame = this.frame;
    frame.drawCalls = 0;
    frame.computeCalls = 0;
    frame.renderPasses = 0;
    frame.computePasses = 0;
    frame.clearPasses = 0;
    frame.instances = 0;
    frame.vertices = 0;
    frame.triangles = 0;
  }
}

export const prodAurora: IAuroraModule = {
  connect: () => {},
  onCollectingChange: () => {},
  endFrame: () => {},
  watchDevice: () => {},
  watchShader: () => {},
  watchPipeline: () => {},
  watchRender: (encoder) => encoder,
  watchCompute: (encoder) => encoder,
  watchClear: () => {},
  connectCounters: () => {},
  disconnectCounters: () => {},
};
