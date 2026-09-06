import { ILogger } from "../interfaces";
const LOG_TYPE = ["log", "success", "error", "warn", "notify"] as const;
type LogType = (typeof LOG_TYPE)[number];
type HistoryEntry = { time: string; data: unknown };
const CONSOLE_STYLE =
  "padding:2px 6px;border-radius:3px;font-weight:600;color:#fff";
const LEVEL_STYLE: Record<LogType, string> = {
  log: `${CONSOLE_STYLE};background:#3b82f6`,
  success: `${CONSOLE_STYLE};background:#22c55e`,
  error: `${CONSOLE_STYLE};background:#ef4444`,
  warn: `${CONSOLE_STYLE};background:#f59e0b;color:#000`,
  notify: `${CONSOLE_STYLE};background:#a855f7`,
};
const getTime = () =>
  Temporal.Now.plainDateTimeISO().toString({ smallestUnit: "seconds" });
export class DevLogger implements ILogger {
  private history: Record<LogType, HistoryEntry[]> = {
    log: [],
    success: [],
    error: [],
    warn: [],
    notify: [],
  };
  log(data: unknown) {
    console.log("%c[log]", `${LEVEL_STYLE.log}`, data);
    this.history.log.push({
      data,
      time: getTime(),
    });
  }
  success(data: unknown) {
    console.log("%c[success]", `${LEVEL_STYLE.success}`, data);
    this.history.success.push({
      data,
      time: getTime(),
    });
  }
  error(data: unknown) {
    console.error("%c[error]", `${LEVEL_STYLE.error}`, data);
    this.history.error.push({
      data,
      time: getTime(),
    });
  }
  warn(data: unknown) {
    console.warn("%c[warn]", `${LEVEL_STYLE.warn}`, data);
    this.history.warn.push({
      data,
      time: getTime(),
    });
  }
  notify(data: unknown) {
    console.info("%c[notification]", `${LEVEL_STYLE.notify}`, data);
    this.history.notify.push({
      data,
      time: getTime(),
    });
  }
}

// // WERSJA PROD - Płaski obiekt
export const prodLogger: ILogger = {
  log: () => {},
};
