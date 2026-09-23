import { API } from "../preload/preload";
import type { GraphTexture } from "../core/aurora/renderGraph";
declare global {
  interface Window {
    API: typeof API;
    openProfiler?: () => void;
  }
  // app.getGPUInfo("complete"), shape depends on platform and driver
  interface GpuInfo {
    gpuDevice?: {
      active: boolean;
      deviceString?: string;
      driverVendor?: string;
      driverVersion?: string;
      gpuPreference?: number;
    }[];
  }
  interface DebugEvent {
    category: string;
    type: string;
    severity: "error" | "warning";
    message: string;
    count: number;
    firstFrame: number;
    lastFrame: number;
  }
  interface PerformanceSnapshot {
    fps: number;
    cpuTimeMs: number;
    onePercentLow: number;
  }
  interface AuroraReport {
    // per-frame values collected since the previous report, one array per metric key
    series: Record<string, number[]>;
    state?: AuroraState;
    events?: DebugEvent[];
    // slowest frame since the previous report
    timeline?: GpuTimelineFrame;
  }
  interface GpuTimelineFrame {
    frame: number;
    span: number;
    busy: number;
    steps: { owner: string; label: string; start: number; time: number }[];
  }
  interface AuroraState {
    memory: {
      rows: AuroraMemoryRow[];
      textures: number;
      buffers: number;
      total: number;
    };
    pool: {
      allocated: number;
      free: number;
      allocatedCount: number;
      freeCount: number;
      // pool textures nothing acquired for AURORA_REPORT.unusedAfterMs
      unused: number;
      unusedCount: number;
    };
    textures: AuroraTexture[];
    gpu: {
      adapter: AuroraAdapter | null;
      devices: NonNullable<GpuInfo["gpuDevice"]>;
    };
    config: AuroraConfigState;
    preset: AuroraPresetState | null;
  }
  // summary of AuroraConfig, the raw one carries font JSONs and asset urls
  interface AuroraConfigState {
    rendering: Record<string, string>;
    renderSize: Size2D;
    canvas: { width: number; height: number; format: string };
    textures: number;
    uiTextures: number;
    fonts: { name: string; type: string }[];
    fontAtlas: { pageSize: number; pages: number; spread: number };
    passes: string[];
    materials: string[];
  }
  interface AuroraPresetState {
    name: string;
    // nested keys joined with ".", arrays joined with ", "
    config: Record<string, string>;
    info: Record<string, string>;
  }
  interface AuroraMemoryRow {
    group: string;
    kind: "texture" | "buffer";
    count: number;
    bytes: number;
  }
  interface AuroraTexture extends GraphTexture {
    bytes: number;
  }
  interface AuroraAdapter {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
  }
}
