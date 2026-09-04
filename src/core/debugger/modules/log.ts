import { ILogger } from "../interfaces";
const LOG_TYPE = ["log", "success", "error", "warn", "notify"] as const;
// // WERSJA DEV - Zaawansowana klasa
export class DevLogger implements ILogger {
  private history: Record<(typeof LOG_TYPE)[number], unknown[]> = {
    log: [],
    success: [],
    error: [],
    warn: [],
    notify: [],
  };
  log(data: unknown) {
    console.log("[DEV LOGGER]:", data);
    this.history.log.push();
  }
  success(data: unknown) {
    console.log("[DEV LOGGER]:", data);
  }
  error(data: unknown) {
    console.log("[DEV LOGGER]:", data);
  }
  warn(data: unknown) {
    console.log("[DEV LOGGER]:", data);
  }
  notify(data: unknown) {
    console.log("[DEV LOGGER]:", data);
  }
}

// // WERSJA PROD - Płaski obiekt
export const prodLogger: ILogger = {
  log: () => {},
};
