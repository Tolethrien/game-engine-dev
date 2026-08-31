import { IDebug } from "./interfaces";
import { prodPerformance } from "./modules/performance";
export const debug: IDebug = {
  performance: prodPerformance,
};
