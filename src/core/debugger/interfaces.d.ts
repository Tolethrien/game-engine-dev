import type { Pass } from "@/core/aurora/pass";
import type { GraphTexture } from "@/core/aurora/renderGraph";
import type { GpuSteps } from "@/core/aurora/timer";
import type { AuroraConfig, ChangeableRenderConfig } from "@/core/aurora/config";
import type { CameraData } from "@/core/aurora/sharedBinds";
import type ScreenEffect from "@/core/aurora/urp/effects/screenEffect";
import type Material from "@/core/aurora/material";
import type { RenderPreset } from "@/core/aurora/preset";
import type { LogScopeKey } from "./modules/log/scopes";
import type { WatchCells } from "./modules/watch/report";
import type { PostDraw } from "@/core/aurora/urp/draw/drawPost";
import type { LightDraw } from "@/core/aurora/urp/draw/drawLight";
import type { SortProps, URPProps } from "@/core/aurora/urp/urp";
import type { TexturePreview } from "@/core/aurora/urp/passes/previewPass";
import type { TweakField, TweakFieldsSectionInfo } from "./modules/tweak/report";

export interface ILogHandle {
  log(...args: unknown[]): void;
  success(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  notify(...args: unknown[]): void;
  throttle(ms: number): ILogHandle;
  changed(): ILogHandle;
  // with a key: the same handle on every call, so it can be used inline
  once(key?: string): ILogHandle;
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
  // the settings pages edit through these: a debugger module importing the engine would be an import cycle
  setParameter: (props: DeepPartial<ChangeableRenderConfig>) => void;
  camera: () => CameraData;
  setCamera: (camera: Partial<CameraData>) => void;
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
  mood(post: PostDraw, light: LightDraw, urp: UrpDebugData): void;
  texturePreview(preview: TexturePreview): () => void;
}
export interface UrpDebugData {
  get(): SortProps;
  // a new URP.init keeping the live post and light state, so the mood is not reset
  apply(props: DeepPartial<URPProps>): void;
  effects(): readonly ScreenEffect[];
  effect(name: string): ScreenEffect;
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
export interface TweakFieldsSection extends TweakFieldsSectionInfo {
  // game side only, "export changed" leaves out fields equal to these (arg "value": { [field.key]: value })
  defaults?: Record<string, unknown>;
  // arg "value": { [field.key]: value }
  get(): Record<string, unknown>;
  set(values: Record<string, unknown>): void;
  // arg "object": the whole export line from the exported fields, default call(formatLiteral(values))
  format?(values: Record<string, unknown>): string;
}
export interface TweakListItem {
  // may depend on the element (other params per effect)
  fields(value: Record<string, unknown>): TweakField[];
  // null: nothing to add, the profiler disables "+ add"; with the current element for a reset of one field
  create(value?: Record<string, unknown>): Record<string, unknown> | null;
  label?(value: Record<string, unknown>): string;
}
export interface TweakListSection {
  title: string;
  call: string;
  arg: "list";
  item: TweakListItem;
  get(): Record<string, unknown>[];
  // always the whole list, never a patch at an index
  set(items: Record<string, unknown>[]): void;
  // "export changed" skips a list equal to this
  defaults?: Record<string, unknown>[];
  // the whole export line, default call(formatLiteral(items))
  format?(items: Record<string, unknown>[]): string;
}
export type TweakSection = TweakFieldsSection | TweakListSection;
export interface TweakPanel {
  title: string;
  // sections is a getter, the schema is rebuilt while the panel is open; the section count must stay the same
  live?: boolean;
  // default true, false hides the export buttons
  exportable?: boolean;
  // default true, false hides Revert and the preset bar
  presets?: boolean;
  group?: string;
  // page order inside the group
  order?: number;
  // default true, false skips the console command (code opens the panel)
  command?: boolean;
  sections: TweakSection[];
}
export interface ITweakModule {
  register(name: string, panel: TweakPanel): () => void;
  open(name: string): void;
  openGroup(group: string): void;
  endFrame(): void;
}
export interface IDebug {
  performance: IPerformanceModule;
  aurora: IAuroraModule;
  log: ILogger;
  watch: IWatchModule;
  command: ICommandModule;
  tweak: ITweakModule;
}
