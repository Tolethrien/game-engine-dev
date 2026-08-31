import { DevPerformance } from "./modules/performance";
export class Debug {
  public performance = new DevPerformance();
  constructor() {
    console.log("DEV DEBUG CREATED");
  }
}

export const debug = new Debug();
