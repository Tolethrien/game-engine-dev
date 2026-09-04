export interface ILogger {
  log: (data: unknown) => void;
}
export interface IPerformanceModule {
  startFrame(): void;
  endFrame(frameTimeMs: number): void;
  getFps(): number;
  getCpuTime(): number;
}
export interface IAuroraModule {
  reportGPUData(data: AuroraSnapshot): void;
}
export interface IDebug {
  performance: IPerformanceModule;
  aurora: IAuroraModule;
  log: ILogger;
}
