export type LogLevel = "log" | "success" | "warn" | "error" | "notify";

export type SerializedValue =
  | { type: "string"; value: string; more: number } // more = cut characters
  | { type: "number"; value: number | string } // NaN / Infinity / -0 as string
  | { type: "boolean"; value: boolean }
  | { type: "null" }
  | { type: "undefined" }
  | { type: "bigint"; value: string }
  | { type: "symbol"; value: string }
  | { type: "function"; name: string; source: string; more: number } // source dedented, more = cut characters
  | {
      type: "object";
      className: string;
      entries: [string, SerializedValue][];
      more: number;
    }
  | {
      type: "array";
      className: string;
      length: number;
      items: SerializedValue[];
      more: number;
    } // also typed arrays
  | { type: "map"; entries: [SerializedValue, SerializedValue][]; more: number }
  | { type: "set"; items: SerializedValue[]; more: number }
  | { type: "date"; value: string }
  | { type: "error"; name: string; message: string; stack: string }
  | { type: "gpu"; className: string; label: string; info: [string, string][] }
  | { type: "ref"; className: string } // cycle
  | { type: "truncated"; className: string } // depth / node limit
  | { type: "unreadable"; reason: string }; // own getter (never called) or a read that threw

export interface LogSuppressed {
  count: number;
  reason: "throttle" | "changed";
}

export type LogEntry =
  | {
      kind: "entry";
      id: number;
      frame: number;
      time: number;
      scope: string;
      level: LogLevel;
      parts: SerializedValue[];
      suppressed?: LogSuppressed;
    }
  | { kind: "valve"; id: number; frame: number; time: number; dropped: number }
  // reload: a game reload, the profiler clears its view on it unless `keep` is on
  | { kind: "separator"; id: number; time: number; label: string; reload: boolean };

export type LogEntryOf<Kind extends LogEntry["kind"]> = Extract<
  LogEntry,
  { kind: Kind }
>;

export type LogMessage =
  | { type: "entry"; entry: LogEntry }
  | { type: "bump"; id: number; suppressed: LogSuppressed };
