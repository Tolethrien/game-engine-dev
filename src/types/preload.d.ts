import { API } from "../preload/preload";
import type { GraphTexture } from "../core/aurora2/renderGraph";
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
  interface AuroraPassTime {
    name: string;
    time: number;
    max: number;
  }
  interface AuroraStepTime {
    owner: string;
    label: string;
    time: number;
  }
  interface AuroraError {
    type: "gpu" | "lost" | "shader";
    message: string;
    count: number;
  }
  interface AuroraSnapshot {
    gpu: {
      time: number;
      timeMax: number;
      passes: AuroraPassTime[];
      steps: AuroraStepTime[];
    };
    calls: { draw: number; compute: number };
    passes: { render: number; compute: number; clear: number };
    geometry: { instances: number; vertices: number; triangles: number };
    // per pass name, e.g. { draw: { total: 120 } }
    counters: Record<string, Record<string, number>>;
    resources: {
      activePasses: string[];
      textures: GraphTexture[];
      pool: { total: number };
    };
    errors: AuroraError[];
  }
}
