export interface SampleStats {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
}

export function sampleStats(values: readonly number[]): SampleStats | null {
  const count = values.length;
  if (count === 0) return null;
  const sorted = Float64Array.from(values).sort();
  const middle = count >> 1;
  return {
    count,
    min: sorted[0],
    median:
      count % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.min(count - 1, Math.floor(count * 0.95))],
    max: sorted[count - 1],
  };
}
