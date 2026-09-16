import { API } from "../preload/preload";
declare global {
  interface Window {
    API: typeof API;
    openProfiler?: () => void;
  }
  interface PerformanceSnapshot {
    fps: number;
    cpuTimeMs: number;
    onePercentLow: number;
  }
  interface AuroraSnapshot {
    GPUTime: number;
    CPUTime: number;
    pipelineTimes: { name: string; time: number }[];
    pipelineInUse: string[];
    drawCalls: number;
    computeCalls: number;
    totalCalls: number;
    renderPasses: number;
    computePasses: number;
    clearPasses: number;
    instances: number;
    vertices: number;
    triangles: number;
    textures: number;
    /** per source, e.g. { draw: { bodies: 120 } } */
    counters: Record<string, Record<string, number>>;
  }
}
