import type { GpuSteps } from "@/core/aurora/timer";
import { AuroraDebugData, IAuroraModule } from "../interfaces";
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
interface TimeAccumulator {
  sum: number;
  samples: number;
  max: number;
  frameTime: number;
}
interface StepAccumulator {
  owner: string;
  sum: number;
  samples: number;
}

const createTimeAccumulator = (): TimeAccumulator => ({
  sum: 0,
  samples: 0,
  max: 0,
  frameTime: 0,
});
const roundMs = (ms: number) => Math.round(ms * 1000) / 1000;

export class AuroraDevModule implements IAuroraModule {
  private lastReport = 0;
  private collecting = false;
  private source: (() => AuroraDebugData) | null = null;
  private errors: Map<string, AuroraError> = new Map();
  private topologies: WeakMap<GPURenderPipeline, GPUPrimitiveTopology> =
    new WeakMap();
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
  private gpu = {
    readFrame: -1,
    total: createTimeAccumulator(),
    passes: new Map<string, TimeAccumulator>(),
    // passes seen in the frame being accumulated, reused to avoid per-frame allocation
    framePasses: [] as TimeAccumulator[],
    steps: new Map<string, StepAccumulator>(),
  };

  public connect(source: () => AuroraDebugData) {
    this.source = source;
  }

  public watchDevice(device: GPUDevice) {
    device.lost.then((info) => {
      if (info.reason === "destroyed") return;
      this.recordError("lost", info.message);
      console.error(`[Aurora] GPU device lost: ${info.message}`);
    });

    device.addEventListener("uncapturederror", (event) => {
      event.preventDefault();
      const message = event.error.message;
      if (this.recordError("gpu", message) > 1) return;
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
        if (msg.type === "error") {
          this.recordError("shader", text);
          console.error(text);
        } else if (msg.type === "warning") console.warn(text);
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

  public endFrame() {
    if (!profilerState.isOpen) {
      if (this.collecting) {
        this.resetGpu();
        this.resetFrame();
      }
      this.collecting = false;
      return;
    }
    // counts of the frame that just ended were not collected, wait a full window
    if (!this.collecting) this.lastReport = performance.now();
    this.collecting = true;

    const data = this.source?.();
    if (data) {
      this.accumulateGpu(data.steps);
      this.report(data);
    }
    this.resetFrame();
  }

  private accumulateGpu(steps: Readonly<GpuSteps>) {
    const gpu = this.gpu;
    if (steps.frame <= gpu.readFrame) return;
    gpu.readFrame = steps.frame;

    let total = 0;
    for (let i = 0; i < steps.count; i++) {
      const time = steps.times[i];
      const owner = steps.owners[i];
      const label = steps.labels[i];
      total += time;

      let pass = gpu.passes.get(owner);
      if (!pass) gpu.passes.set(owner, (pass = createTimeAccumulator()));
      if (!gpu.framePasses.includes(pass)) gpu.framePasses.push(pass);
      pass.frameTime += time;

      let step = gpu.steps.get(label);
      if (!step) gpu.steps.set(label, (step = { owner, sum: 0, samples: 0 }));
      step.sum += time;
      step.samples++;
    }

    for (const pass of gpu.framePasses) {
      this.addSample(pass, pass.frameTime);
      pass.frameTime = 0;
    }
    gpu.framePasses.length = 0;
    this.addSample(gpu.total, total);
  }

  private report(data: AuroraDebugData) {
    const now = performance.now();
    if (now - this.lastReport < REPORT_INTERVAL_MS) return;
    this.lastReport = now;

    const frame = this.frame;
    const gpu = this.gpu;
    const counters: Record<string, Record<string, number>> = {};
    for (const pass of data.activePasses) {
      if (pass.counters) counters[pass.name] = pass.counters();
    }

    const passes: AuroraPassTime[] = [];
    gpu.passes.forEach((pass, name) =>
      passes.push({
        name,
        time: roundMs(pass.sum / pass.samples),
        max: roundMs(pass.max),
      }),
    );
    const steps: AuroraStepTime[] = [];
    gpu.steps.forEach((step, label) =>
      steps.push({
        owner: step.owner,
        label,
        time: roundMs(step.sum / step.samples),
      }),
    );
    const total = gpu.total;

    window.API.DEBUG.sendAuroraSnapshot({
      gpu: {
        time: roundMs(
          total.samples > 0 ? total.sum / total.samples : (data.gpuTime ?? 0),
        ),
        timeMax: roundMs(total.max),
        passes,
        steps,
      },
      calls: { draw: frame.drawCalls, compute: frame.computeCalls },
      passes: {
        render: frame.renderPasses,
        compute: frame.computePasses,
        clear: frame.clearPasses,
      },
      geometry: {
        instances: frame.instances,
        vertices: frame.vertices,
        triangles: frame.triangles,
      },
      counters,
      resources: {
        activePasses: data.activePasses.map((pass) => pass.name),
        textures: data.textures(),
        pool: { total: data.poolTotal() },
      },
      errors: [...this.errors.values()],
    });
    this.resetGpu();
  }

  private addSample(accumulator: TimeAccumulator, time: number) {
    accumulator.sum += time;
    accumulator.samples++;
    if (time > accumulator.max) accumulator.max = time;
  }

  private recordError(type: AuroraError["type"], message: string) {
    const key = `${type}|${message}`;
    let error = this.errors.get(key);
    if (!error) this.errors.set(key, (error = { type, message, count: 0 }));
    return ++error.count;
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

  // passes and labels are rebuilt each window, so the report keeps execution order
  private resetGpu() {
    const gpu = this.gpu;
    gpu.passes.clear();
    gpu.steps.clear();
    gpu.framePasses.length = 0;
    const total = gpu.total;
    total.sum = 0;
    total.samples = 0;
    total.max = 0;
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
  endFrame: () => {},
  watchDevice: () => {},
  watchShader: () => {},
  watchPipeline: () => {},
  watchRender: (encoder) => encoder,
  watchCompute: (encoder) => encoder,
  watchClear: () => {},
};
