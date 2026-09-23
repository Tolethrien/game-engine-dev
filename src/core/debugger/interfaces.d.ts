import type { Pass } from "@/core/aurora/pass";
import type { GraphTexture } from "@/core/aurora/renderGraph";
import type { GpuSteps } from "@/core/aurora/timer";
import type { AuroraConfig } from "@/core/aurora/config";
import type Material from "@/core/aurora/material";
import type { RenderPreset } from "@/core/aurora/preset";

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
  steps: Readonly<GpuSteps>;
  activePasses: readonly Pass[];
  textures: () => GraphTexture[];
  pool: () => {
    used: ReadonlyMap<GPUTexture, string>;
    free: ReadonlyMap<string, readonly GPUTexture[]>;
  };
  settings: () => DeepReadonly<AuroraConfig>;
  renderSize: () => Size2D;
  canvas: () => { width: number; height: number; format: GPUTextureFormat };
  materials: () => readonly Material[];
  preset: () => RenderPreset | null;
}
export interface IAuroraModule {
  connect(source: () => AuroraDebugData): void;
  endFrame(): void;
  beginPass(pass: Pass): void;
  watchDevice(device: GPUDevice, adapter: GPUAdapter): void;
  watchShader(label: string, module: GPUShaderModule, code: string): void;
  watchPipeline(
    pipeline: GPURenderPipeline,
    topology: GPUPrimitiveTopology,
  ): void;
  watchRender(encoder: GPURenderPassEncoder): GPURenderPassEncoder;
  watchCompute(encoder: GPUComputePassEncoder): GPUComputePassEncoder;
  watchClear(): void;
  poolAcquire(texture: GPUTexture): void;
  poolRelease(texture: GPUTexture): void;
}
export interface IDebug {
  performance: IPerformanceModule;
  aurora: IAuroraModule;
  log: ILogger;
}
