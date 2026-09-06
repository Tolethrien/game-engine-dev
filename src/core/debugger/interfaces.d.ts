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
export interface IAuroraModule {
  reportGPUData(data: AuroraSnapshot): void;
}
export interface IDebug {
  performance: IPerformanceModule;
  aurora: IAuroraModule;
  log: ILogger;
}
