import type { GraphTexture } from "@/core/aurora/renderGraph";
import type { DebugEvent, GpuInfo } from "../../report";

export interface AuroraReport {
  // per-frame values collected since the previous report, one array per metric key
  series: Record<string, number[]>;
  state?: AuroraState;
  events?: DebugEvent[];
  // slowest frame since the previous report
  timeline?: GpuTimelineFrame;
}
export interface GpuTimelineFrame {
  frame: number;
  span: number;
  busy: number;
  steps: { owner: string; label: string; start: number; time: number }[];
}
export interface AuroraState {
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
export interface AuroraConfigState {
  rendering: Record<string, string>;
  renderSize: Size2D;
  canvas: { width: number; height: number; format: string };
  textures: number;
  uiTextures: number;
  fonts: { name: string; type: string }[];
  fontAtlas: { pageSize: number; pages: number; spread: number };
}
export interface AuroraPresetState {
  name: string;
  // nested keys joined with ".", arrays joined with ", "
  config: Record<string, string>;
  info: Record<string, string>;
  passes: string[];
  materials: string[];
}
export interface AuroraMemoryRow {
  group: string;
  kind: "texture" | "buffer";
  count: number;
  bytes: number;
}
export interface AuroraTexture extends GraphTexture {
  bytes: number;
}
export interface AuroraAdapter {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  isFallbackAdapter: boolean;
}
