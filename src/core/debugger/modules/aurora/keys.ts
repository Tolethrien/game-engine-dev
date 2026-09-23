// shared by the game module and the profiler, keep free of imports
export const AURORA_REPORT = {
  intervalMs: 250,
  stateIntervalMs: 1000,
  unusedAfterMs: 5000,
};

export const METRIC_KEYS = {
  gpuSpan: "gpu.span",
  gpuBusy: "gpu.busy",
  nodeSum: "gpu.sum:",
  nodeCount: "gpu.count:",
  encoder: "cat:",
  stat: "stat:",
  poolPeak: "pool.peak",
  poolPeakCount: "pool.peakCount",
};

export const ENCODER_FIELDS = [
  "draws",
  "instances",
  "triangles",
  "vertices",
  "pipelines",
  "steps",
] as const;

export type EncoderField = (typeof ENCODER_FIELDS)[number];

export const ENCODER_TOTAL = "total";

export const encoderKey = (category: string, field: EncoderField) =>
  `${METRIC_KEYS.encoder}${category}.${field}`;

export const statKey = (category: string, name: string) =>
  `${METRIC_KEYS.stat}${category}.${name}`;
