import Time from "@engine/time";
import { IPerformanceModule } from "../interfaces";
interface FrameSample {
  time: number;
  frameTimeMs: number;
  cpuTimeMs: number;
}
export class DevPerformance implements IPerformanceModule {
  private static readonly HISTORY_WINDOW_MS = 30000;
  private history: FrameSample[] = [];
  private snapshotElapsedMs = 0;

  public endFrame(frameTimeMs: number) {
    const now = performance.now();
    this.history.push({ time: now, frameTimeMs, cpuTimeMs: Time.getCpuTime() });
    this.trimHistory(now);

    this.snapshotElapsedMs += frameTimeMs;
    if (this.snapshotElapsedMs < 1000) return;
    this.snapshotElapsedMs -= 1000;
    this.pushSnapshot();
  }

  private pushSnapshot() {
    window.API.DEBUG.sendPerformanceSnapshot({
      fps: Time.getFps(),
      cpuTimeMs: Time.getCpuTime(),
      onePercentLow: this.get1PercentLow(),
    });
  }
  private trimHistory(now: number) {
    const cutoff = now - DevPerformance.HISTORY_WINDOW_MS;
    let i = 0;
    while (i < this.history.length && this.history[i].time < cutoff) i++;
    if (i > 0) this.history.splice(0, i);
  }
  public get1PercentLow(windowMs = DevPerformance.HISTORY_WINDOW_MS) {
    if (this.history.length === 0) return 0;
    const cutoff = this.history.at(-1)!.time - windowMs;
    const samples = this.history
      .filter((s) => s.time >= cutoff)
      .map((s) => s.frameTimeMs)
      .sort((a, b) => b - a);

    const count = Math.max(1, Math.ceil(samples.length * 0.01));
    const worstAvgMs =
      samples.slice(0, count).reduce((sum, v) => sum + v, 0) / count;
    return 1000 / worstAvgMs;
  }
}

export const prodPerformance: IPerformanceModule = {
  endFrame: () => {},
};
