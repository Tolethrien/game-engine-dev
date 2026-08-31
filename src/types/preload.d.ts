import { API } from "../preload/preload";
declare global {
  interface Window {
    API: typeof API;
  }
  interface PerformanceSnapshot {
    fps: number;
    cpuTimeMs: number;
    onePercentLow: number;
  }
}
