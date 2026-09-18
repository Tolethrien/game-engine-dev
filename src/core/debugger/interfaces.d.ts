import type { Pass } from "@/core/aurora2/pass";
import type { GraphTexture } from "@/core/aurora2/renderGraph";
import type { GpuSteps } from "@/core/aurora2/timer";

export interface ILogger {
  log: (data: unknown) => void;
  success: (data: unknown) => void;
  error: (data: unknown) => void;
  warn: (data: unknown) => void;
  notify: (data: unknown) => void;
}
export interface IPerformanceModule {
  endFrame(frameTimeMs: number): void;
}
export interface AuroraDebugData {
  gpuTime: number | null;
  steps: Readonly<GpuSteps>;
  activePasses: readonly Pass[];
  textures: () => GraphTexture[];
  poolTotal: () => number;
}
export interface IAuroraModule {
  connect(source: () => AuroraDebugData): void;
  endFrame(): void;
  watchDevice(device: GPUDevice): void;
  watchShader(label: string, module: GPUShaderModule, code: string): void;
  watchPipeline(
    pipeline: GPURenderPipeline,
    topology: GPUPrimitiveTopology,
  ): void;
  watchRender(encoder: GPURenderPassEncoder): GPURenderPassEncoder;
  watchCompute(encoder: GPUComputePassEncoder): GPUComputePassEncoder;
  watchClear(): void;
}
export interface IDebug {
  performance: IPerformanceModule;
  aurora: IAuroraModule;
  log: ILogger;
}
