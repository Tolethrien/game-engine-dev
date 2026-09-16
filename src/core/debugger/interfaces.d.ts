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
  passTimes: { name: string; time: number }[];
  activePasses: string[];
  textures: number;
}
export interface IAuroraModule {
  connect(source: () => AuroraDebugData): void;
  onCollectingChange(callback: (collecting: boolean) => void): void;
  endFrame(): void;
  watchDevice(device: GPUDevice): void;
  watchShader(label: string, module: GPUShaderModule, code: string): void;
}
export interface IDebug {
  performance: IPerformanceModule;
  aurora: IAuroraModule;
  log: ILogger;
}
