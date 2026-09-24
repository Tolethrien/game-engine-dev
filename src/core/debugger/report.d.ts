// payloads sent between the game, the backend and the profiler window

// app.getGPUInfo("complete"), shape depends on platform and driver
export interface GpuInfo {
  gpuDevice?: {
    active: boolean;
    deviceString?: string;
    driverVendor?: string;
    driverVersion?: string;
    gpuPreference?: number;
  }[];
}
export interface DebugEvent {
  category: string;
  type: string;
  severity: "error" | "warning";
  message: string;
  count: number;
  firstFrame: number;
  lastFrame: number;
}
export interface PerformanceSnapshot {
  fps: number;
  cpuTimeMs: number;
  onePercentLow: number;
}
