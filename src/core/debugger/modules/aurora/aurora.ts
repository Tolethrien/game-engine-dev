import type { Pass } from "@/core/aurora/pass";
import type {
  AuroraDebugData,
  IAuroraModule,
  ILogHandle,
} from "../../interfaces";
import { profilerState } from "../../profilerState";
import { AURORA_REPORT, METRIC_KEYS, statKey } from "./keys";
import { SeriesBuffer } from "./seriesBuffer";
import { GpuTree } from "./gpuTree";
import { GpuTimeline } from "./timeline";
import { EncoderStats } from "./encoderStats";
import { MemoryTracker, textureBytes } from "./memory";
import type { DebugEvent, GpuInfo } from "../../report";
import type {
  AuroraAdapter,
  AuroraConfigState,
  AuroraPresetState,
  AuroraReport,
  AuroraState,
} from "./report";

type AuroraEventType = "gpu" | "lost" | "shader";

export class AuroraDevModule implements IAuroraModule {
  private source: (() => AuroraDebugData) | null = null;
  private collecting = false;
  private frame = 0;
  private buffer = new SeriesBuffer();
  private gpuTree = new GpuTree();
  private timeline = new GpuTimeline();
  private encoder = new EncoderStats();
  private memory: MemoryTracker;
  private events: DebugEvent[] = [];
  private eventIndex: Map<string, DebugEvent> = new Map();
  private changedEvents: Set<DebugEvent> = new Set();
  // per frame sums of Pass.stats(), passes sharing a category add up
  private passStats: Map<string, number> = new Map();
  private statKeys: Map<string, Map<string, string>> = new Map();
  private report = {
    lastSeries: 0,
    lastState: 0,
    // first report after collecting starts carries state and every event
    first: true,
  };
  private pool = { used: 0, peak: 0, count: 0, peakCount: 0 };
  // a pool texture not acquired for AURORA_REPORT.unusedAfterMs is memory nothing needs
  private lastAcquired: WeakMap<GPUTexture, number> = new WeakMap();
  private gpuInfo: GpuInfo | null = null;
  private adapter: AuroraAdapter | null = null;

  constructor(private readonly log: ILogHandle) {
    this.memory = new MemoryTracker(log);
    window.API.DEBUG.getGpuInfo().then((info) => (this.gpuInfo = info));
  }

  public connect(source: () => AuroraDebugData) {
    this.source = source;
  }

  public watchDevice(device: GPUDevice, adapter: GPUAdapter) {
    this.memory.watch(device);
    // GPUAdapterInfo fields are prototype getters, copy them so the object survives IPC
    const { vendor, architecture, device: name, description } = adapter.info;
    this.adapter = {
      vendor,
      architecture,
      device: name,
      description,
      isFallbackAdapter:
        (adapter.info as { isFallbackAdapter?: boolean }).isFallbackAdapter ??
        (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter ??
        false,
    };
    device.lost.then((info) => {
      if (info.reason === "destroyed") return;
      this.recordEvent("lost", "error", info.message);
      this.log.error(`device lost: ${info.message}`);
    });

    device.addEventListener("uncapturederror", (event) => {
      event.preventDefault();
      const message = event.error.message;
      if (this.recordEvent("gpu", "error", message) > 1) return;
      this.log.error(`WebGPU error (reported once):\n${message}`);
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
          this.recordEvent("shader", "error", text);
          this.log.error(text);
        } else if (msg.type === "warning") {
          this.recordEvent("shader", "warning", text);
          this.log.warn(text);
        } else this.log.log(text);
      }
    });
  }
  public watchPipeline(
    pipeline: GPURenderPipeline,
    topology: GPUPrimitiveTopology,
  ) {
    this.encoder.watchPipeline(pipeline, topology);
  }

  // counting wrappers exist only while the profiler is open
  public beginPass(pass: Pass) {
    if (this.collecting) this.encoder.beginPass(pass);
  }
  public watchRender(encoder: GPURenderPassEncoder) {
    if (!this.collecting) return encoder;
    return this.encoder.watchRender(encoder);
  }
  public watchCompute(encoder: GPUComputePassEncoder) {
    if (!this.collecting) return encoder;
    return this.encoder.watchCompute(encoder);
  }
  public watchClear() {
    if (this.collecting) this.encoder.watchClear();
  }

  // tracked even while not collecting, otherwise the in-use sum drifts
  public poolAcquire(texture: GPUTexture) {
    const pool = this.pool;
    pool.used += this.memory.bytesOf(texture);
    pool.count++;
    this.lastAcquired.set(texture, performance.now());
    if (pool.used > pool.peak) pool.peak = pool.used;
    if (pool.count > pool.peakCount) pool.peakCount = pool.count;
  }
  public poolRelease(texture: GPUTexture) {
    this.pool.used -= this.memory.bytesOf(texture);
    this.pool.count--;
  }

  public getEvents(): readonly DebugEvent[] {
    return this.events;
  }

  public endFrame() {
    this.frame++;
    if (!profilerState.isOpen) {
      if (this.collecting) this.reset();
      this.collecting = false;
      return;
    }
    const now = performance.now();
    // this frame ran without wrappers, its encoder counts would be zeros
    if (!this.collecting) {
      this.collecting = true;
      this.report.lastSeries = now;
      this.encoder.reset();
      this.resetPoolPeak();
      return;
    }

    const data = this.source?.();
    if (!data) return;
    this.gpuTree.update(data.steps, this.buffer);
    this.timeline.update(data.steps);
    this.encoder.flush(this.buffer);
    this.collectPassStats(data.activePasses);
    this.buffer.push(METRIC_KEYS.poolPeak, this.pool.peak);
    this.buffer.push(METRIC_KEYS.poolPeakCount, this.pool.peakCount);
    this.resetPoolPeak();

    if (now - this.report.lastSeries >= AURORA_REPORT.intervalMs) {
      this.send(data, now);
    }
  }

  private resetPoolPeak() {
    const pool = this.pool;
    pool.peak = pool.used;
    pool.peakCount = pool.count;
  }

  private send(data: AuroraDebugData, now: number) {
    const report = this.report;
    const message: AuroraReport = { series: this.buffer.take() };
    const timeline = this.timeline.take();
    if (timeline) message.timeline = timeline;
    if (
      report.first ||
      now - report.lastState >= AURORA_REPORT.stateIntervalMs
    ) {
      report.lastState = now;
      message.state = this.buildState(data, now);
    }
    if (report.first) {
      if (this.events.length > 0)
        message.events = this.events.map((event) => ({ ...event }));
    } else if (this.changedEvents.size > 0) {
      message.events = [...this.changedEvents].map((event) => ({ ...event }));
    }
    this.changedEvents.clear();
    report.first = false;
    report.lastSeries = now;
    window.API.DEBUG.sendAuroraReport(message);
  }

  private buildState(data: AuroraDebugData, now: number): AuroraState {
    const summary = this.memory.summary();
    const pool = data.pool();
    const unusedBefore = now - AURORA_REPORT.unusedAfterMs;
    let used = 0;
    pool.used.forEach((_, texture) => (used += this.memory.bytesOf(texture)));
    let free = 0;
    let freeCount = 0;
    let unused = 0;
    let unusedCount = 0;
    pool.free.forEach((list) => {
      freeCount += list.length;
      for (const texture of list) {
        const bytes = this.memory.bytesOf(texture);
        free += bytes;
        if ((this.lastAcquired.get(texture) ?? -Infinity) >= unusedBefore)
          continue;
        unused += bytes;
        unusedCount++;
      }
    });

    return {
      memory: {
        rows: summary.rows,
        textures: summary.totals.texture,
        buffers: summary.totals.buffer,
        total: summary.totals.all,
      },
      pool: {
        allocated: used + free,
        free,
        allocatedCount: pool.used.size + freeCount,
        freeCount,
        unused,
        unusedCount,
      },
      textures: data.textures().map((texture) => ({
        ...texture,
        bytes: textureBytes(
          texture.format,
          texture.width,
          texture.height,
          texture.layers,
          texture.mips,
          this.log,
        ),
      })),
      gpu: { adapter: this.adapter, devices: this.gpuInfo?.gpuDevice ?? [] },
      config: this.buildConfig(data),
      preset: this.buildPreset(data),
    };
  }

  private buildConfig(data: AuroraDebugData): AuroraConfigState {
    const settings = data.settings();
    const rendering: Record<string, string> = {};
    for (const [name, value] of Object.entries(settings.rendering)) {
      if (Array.isArray(value)) rendering[name] = `[${value.join(", ")}]`;
      else if (typeof value === "boolean") rendering[name] = value ? "on" : "off";
      else rendering[name] = String(value);
    }
    return {
      rendering,
      renderSize: { ...data.renderSize() },
      canvas: data.canvas(),
      textures: settings.userTextures.length,
      uiTextures: settings.userUI.length,
      fonts: settings.fonts.map(({ name, type }) => ({ name, type })),
      fontAtlas: { ...settings.fontAtlas },
    };
  }

  private buildPreset(data: AuroraDebugData): AuroraPresetState | null {
    const preset = data.preset();
    if (!preset) return null;
    return {
      name: preset.name,
      config: flatten(preset.getConfig),
      info: preset.info?.() ?? {},
      passes: data.activePasses.map((pass) => pass.name),
      materials: data.materials().map((material) => material.name),
    };
  }

  private collectPassStats(passes: readonly Pass[]) {
    const sums = this.passStats;
    for (const pass of passes) {
      if (pass.category === undefined || !pass.stats) continue;
      const stats = pass.stats();
      for (const name in stats) {
        const key = this.statKey(pass.category, name);
        sums.set(key, (sums.get(key) ?? 0) + stats[name]);
      }
    }
    sums.forEach((value, key) => this.buffer.push(key, value));
    sums.clear();
  }

  private statKey(category: string, name: string) {
    let keys = this.statKeys.get(category);
    if (!keys) this.statKeys.set(category, (keys = new Map()));
    let key = keys.get(name);
    if (!key) keys.set(name, (key = statKey(category, name)));
    return key;
  }

  private recordEvent(
    type: AuroraEventType,
    severity: DebugEvent["severity"],
    message: string,
  ) {
    const id = `${type}|${message}`;
    let event = this.eventIndex.get(id);
    if (!event) {
      event = {
        category: "aurora",
        type,
        severity,
        message,
        count: 0,
        firstFrame: this.frame,
        lastFrame: this.frame,
      };
      this.eventIndex.set(id, event);
      this.events.push(event);
    }
    event.lastFrame = this.frame;
    this.changedEvents.add(event);
    return ++event.count;
  }

  private reset() {
    this.buffer.clear();
    this.encoder.reset();
    this.gpuTree.reset();
    this.timeline.reset();
    this.passStats.clear();
    this.report.lastSeries = 0;
    this.report.lastState = 0;
    this.report.first = true;
  }
}

// { step: { x: 1, y: 1 }, zRange: [0, 255], a: { b: { c: 1 } } }
// → { step: "[1, 1]", zRange: "[0, 255]", "a.b": "[1]" }
function flatten(
  source: object,
  prefix = "",
  target: Record<string, string> = {},
) {
  for (const [name, value] of Object.entries(source)) {
    const key = prefix + name;
    if (value === null || typeof value !== "object") {
      target[key] = String(value);
      continue;
    }
    const values = Array.isArray(value) ? value : Object.values(value);
    const flat = values.every((item) => item === null || typeof item !== "object");
    if (flat) target[key] = `[${values.join(", ")}]`;
    else flatten(value, `${key}.`, target);
  }
  return target;
}

export const prodAurora: IAuroraModule = {
  connect: () => {},
  endFrame: () => {},
  beginPass: () => {},
  watchDevice: () => {},
  watchShader: () => {},
  watchPipeline: () => {},
  watchRender: (encoder) => encoder,
  watchCompute: (encoder) => encoder,
  watchClear: () => {},
  poolAcquire: () => {},
  poolRelease: () => {},
};
