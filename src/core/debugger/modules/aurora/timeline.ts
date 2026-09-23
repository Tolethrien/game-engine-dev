import type { GpuSteps } from "@/core/aurora/timer";

// keeps the slowest frame since the last take, the last frame of an interval almost never holds the spike
export class GpuTimeline {
  private lastReadFrame = -1;
  private found = false;
  private worst = {
    frame: -1,
    span: 0,
    busy: 0,
    owners: [] as string[],
    labels: [] as string[],
    starts: [] as number[],
    times: [] as number[],
  };

  public update(steps: Readonly<GpuSteps>) {
    if (steps.frame <= this.lastReadFrame) return;
    this.lastReadFrame = steps.frame;
    if (steps.count === 0) return;
    if (this.found && steps.span <= this.worst.span) return;

    const worst = this.worst;
    this.found = true;
    worst.frame = steps.frame;
    worst.span = steps.span;
    worst.busy = steps.busy;
    worst.owners.length = 0;
    worst.labels.length = 0;
    worst.starts.length = 0;
    worst.times.length = 0;
    for (let i = 0; i < steps.count; i++) {
      // steps without a valid timestamp pair would be drawn at the frame start
      if (steps.times[i] <= 0) continue;
      worst.owners.push(steps.owners[i]);
      worst.labels.push(steps.labels[i]);
      worst.starts.push(steps.starts[i]);
      worst.times.push(steps.times[i]);
    }
  }

  public take(): GpuTimelineFrame | undefined {
    if (!this.found) return undefined;
    this.found = false;
    const worst = this.worst;
    return {
      frame: worst.frame,
      span: worst.span,
      busy: worst.busy,
      steps: worst.labels.map((label, index) => ({
        owner: worst.owners[index],
        label,
        start: worst.starts[index],
        time: worst.times[index],
      })),
    };
  }

  public reset() {
    this.found = false;
  }
}
