import { IDebug } from "./interfaces";
import { prodAurora } from "./modules/aurora/aurora";
import { prodLogger } from "./modules/log";
import { prodPerformance } from "./modules/performance";
export const debug: IDebug = {
  performance: prodPerformance,
  aurora: prodAurora,
  log: prodLogger,
};
