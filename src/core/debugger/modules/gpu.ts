import { IAuroraModule } from "../interfaces";
import { profilerState } from "../profilerState";

const REPORT_INTERVAL_MS = 1000;

export class AuroraDevModule implements IAuroraModule {
  private lastReport = 0;

  public reportGPUData(data: AuroraSnapshot) {
    if (!profilerState.isOpen) return;
    const now = performance.now();
    if (now - this.lastReport < REPORT_INTERVAL_MS) return;
    this.lastReport = now;
    window.API.DEBUG.sendAuroraSnapshot(data);
  }
}

export const prodAurora: IAuroraModule = {
  reportGPUData: () => {},
};
