import { IPerformanceModule } from "../interfaces";
interface FrameSample {
  time: number;
  frameTimeMs: number;
  cpuTimeMs: number;
}
export class DevPerformance implements IPerformanceModule {
  private static readonly HISTORY_WINDOW_MS = 30000;
  private history: FrameSample[] = [];
  private frames = 0;
  private elapsedMs = 0;
  private fps = 0;
  private frameStart = 0;
  private cpuTimeMs = 0;

  public getCpuTime() {
    return this.cpuTimeMs;
  }
  public getFps() {
    return this.fps;
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
  public startFrame() {
    this.frameStart = performance.now();
  }

  public endFrame(frameTimeMs: number) {
    const frameEnd = performance.now();
    this.cpuTimeMs = frameEnd - this.frameStart;

    this.frames++;
    this.elapsedMs += frameTimeMs;
    if (this.elapsedMs >= 1000) {
      this.fps = this.frames;
      this.frames = 0;
      this.elapsedMs -= 1000;
      this.pushSnapshot();
    }

    this.history.push({
      time: frameEnd,
      frameTimeMs,
      cpuTimeMs: this.cpuTimeMs,
    });
    this.trimHistory(frameEnd);
  }
  private pushSnapshot() {
    window.API.DEBUG.sendPerformanceSnapshot({
      fps: this.fps,
      cpuTimeMs: this.cpuTimeMs,
      onePercentLow: this.get1PercentLow(),
    });
  }
  private trimHistory(now: number) {
    const cutoff = now - DevPerformance.HISTORY_WINDOW_MS;
    let i = 0;
    while (i < this.history.length && this.history[i].time < cutoff) i++;
    if (i > 0) this.history.splice(0, i);
  }
}

export const prodPerformance: IPerformanceModule = {
  startFrame: () => {},
  endFrame: () => {},
  getFps: () => 0,
  getCpuTime: () => 0,
};
