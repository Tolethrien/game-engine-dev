//export interface ILogger {} <- przykladowy moduł
export interface IPerformanceModule {
  startFrame(): void;
  endFrame(frameTimeMs: number): void;
  getFps(): number;
  getCpuTime(): number;
}
export interface IDebug {
  performance: IPerformanceModule;
}
