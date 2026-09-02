import { IDebug } from "./interfaces";
import { prodAurora } from "./modules/gpu";
import { prodPerformance } from "./modules/performance";
export const debug: IDebug = {
  performance: prodPerformance,
  aurora: prodAurora,
};
