import type { Pass } from "@/core/aurora/pass";
import type { GraphTexture } from "@/core/aurora/renderGraph";
import type { GpuSteps } from "@/core/aurora/timer";
import type { AuroraConfig } from "@/core/aurora/config";
import type Material from "@/core/aurora/material";
import type { RenderPreset } from "@/core/aurora/preset";
import type { LogScopeKey } from "./modules/log/scopes";
import type { WatchCells } from "./modules/watch/report";

export interface ILogHandle {
  log(...args: unknown[]): void;
  success(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  notify(...args: unknown[]): void;
  throttle(ms: number): ILogHandle;
  changed(): ILogHandle;
  once(): ILogHandle;
}
export interface ILogger extends ILogHandle {
  scope(key: LogScopeKey): ILogHandle;
  endFrame(): void;
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
export interface WatchOptions {
  scope?: LogScopeKey;
  size?: WatchCells;
  // false for getters building a new object (() => ({ hp, pos })): editing the copy changes nothing
  editable?: boolean;
}
export interface IWatchModule {
  add(name: string, getter: () => unknown, options?: WatchOptions): () => void;
  set(name: string, value: unknown, options?: WatchOptions): void;
  remove(name: string): void;
  endFrame(): void;
}
export interface CommandOptions {
  hint?: string;
}
export interface ExposeOptions extends CommandOptions {
  editable?: boolean;
}
export interface CommandVariable<Value> extends CommandOptions {
  get: () => Value;
  set: (value: Value) => void;
  options?: readonly Value[];
}
export interface ICommandModule {
  expose(name: string, getter: () => unknown, options?: ExposeOptions): () => void;
  variable<Value>(name: string, definition: CommandVariable<Value>): () => void;
  action(
    name: string,
    action: (...args: any[]) => unknown,
    options?: CommandOptions,
  ): () => void;
  endFrame(): void;
}
export interface IDebug {
  performance: IPerformanceModule;
  aurora: IAuroraModule;
  log: ILogger;
  watch: IWatchModule;
  command: ICommandModule;
}
