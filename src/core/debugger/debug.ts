import { AuroraDevModule } from "./modules/gpu";
import { DevPerformance } from "./modules/performance";
export class Debug {
  public performance = new DevPerformance();
  public aurora = new AuroraDevModule();
  constructor() {
    console.log("Dev Profiler connected");
  }
}

export const debug = new Debug();
