import { profilerState } from "./profilerState";
import { AuroraDevModule } from "./modules/gpu";
import { DevPerformance } from "./modules/performance";
import { DevLogger } from "./modules/log";
export class Debug {
  public performance = new DevPerformance();
  public aurora = new AuroraDevModule();
  public log = new DevLogger();
  constructor() {
    profilerState.connect();
    console.log("Dev debug active");
    window.openProfiler = () => {
      window.API.DEBUG.openProfiler();
      console.log("profiler activated");
    };
  }
}

export const debug = new Debug();
