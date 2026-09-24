import { profilerState } from "./profilerState";
import { AuroraDevModule } from "./modules/aurora/aurora";
import { DevPerformance } from "./modules/performance";
import { DevLogger } from "./modules/log/log";
import { CAPTURE, captureErrors } from "./modules/log/capture";
import { DevWatch } from "./modules/watch/watch";
import { DevCommand } from "./modules/command/command";
export class Debug {
  // first: the other modules log through it
  public log = new DevLogger({ mirrorToDevtools: CAPTURE.mirrorToDevtools });
  public performance = new DevPerformance();
  public aurora = new AuroraDevModule(this.log.named("GPU"));
  public watch = new DevWatch();
  public command = new DevCommand(this.watch, this.log.named("Command"));
  constructor() {
    captureErrors(this.log);
    profilerState.connect();
    console.log("Dev debug active");
    window.openProfiler = () => {
      window.API.DEBUG.openProfiler();
      console.log("profiler activated");
    };
  }
}

export const debug = new Debug();
