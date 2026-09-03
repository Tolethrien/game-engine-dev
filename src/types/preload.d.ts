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
    drawCalls: number;
    computeCalls: number;
    totalCalls: number;
    renderPasses: number;
    computePasses: number;
    drawnQuads: number;
    drawnGui: number;
    drawnLights: number;
    drawnTriangles: number;
    drawnVertices: number;
    pipelineInUse: string[];
    usedPostProcessing: string[];
    pipelineTimes: { name: string; time: number }[];
    displayedTexture: string;
    globalIllumination: RGB;
    sortOrder: string;
    drawOrigin: string;
  }
}
