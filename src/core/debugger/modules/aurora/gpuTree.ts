import type { GpuSteps } from "@/core/aurora/timer";
import { METRIC_KEYS } from "./keys";
import { SeriesBuffer } from "./seriesBuffer";

interface NodeFrame {
  sum: number;
  count: number;
  touched: boolean;
  keys: { sum: string; count: string };
}

// "GuiPass:backdrop:mip2" feeds GuiPass, GuiPass:backdrop and GuiPass:backdrop:mip2
export class GpuTree {
  private lastReadFrame = -1;
  private prefixes: Map<string, string[]> = new Map();
  private nodes: Map<string, NodeFrame> = new Map();
  private touched: NodeFrame[] = [];

  public update(steps: Readonly<GpuSteps>, buffer: SeriesBuffer) {
    if (steps.frame <= this.lastReadFrame) return;
    this.lastReadFrame = steps.frame;

    for (let i = 0; i < steps.count; i++) {
      const label = steps.labels[i];
      const time = steps.times[i];
      const paths = this.pathsOf(label);
      for (let depth = 0; depth < paths.length; depth++) {
        const node = this.touch(paths[depth]);
        node.sum += time;
        if (depth === paths.length - 1) node.count++;
      }
    }

    buffer.push(METRIC_KEYS.gpuSpan, steps.span);
    buffer.push(METRIC_KEYS.gpuBusy, steps.busy);
    for (const node of this.touched) {
      buffer.push(node.keys.sum, node.sum);
      if (node.count > 0) buffer.push(node.keys.count, node.count);
      node.sum = 0;
      node.count = 0;
      node.touched = false;
    }
    this.touched.length = 0;
  }

  public reset() {
    for (const node of this.touched) {
      node.sum = 0;
      node.count = 0;
      node.touched = false;
    }
    this.touched.length = 0;
  }

  private pathsOf(label: string) {
    let paths = this.prefixes.get(label);
    if (paths) return paths;
    const segments = label.split(":");
    paths = segments.map((_, index) => segments.slice(0, index + 1).join(":"));
    this.prefixes.set(label, paths);
    return paths;
  }

  private touch(path: string) {
    let node = this.nodes.get(path);
    if (!node) {
      node = {
        sum: 0,
        count: 0,
        touched: false,
        keys: {
          sum: METRIC_KEYS.nodeSum + path,
          count: METRIC_KEYS.nodeCount + path,
        },
      };
      this.nodes.set(path, node);
    }
    if (!node.touched) {
      node.touched = true;
      this.touched.push(node);
    }
    return node;
  }
}
