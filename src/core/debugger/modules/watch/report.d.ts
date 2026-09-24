import type { SerializedValue } from "../log/report";

export interface WatchCells {
  w: number;
  h: number;
}

export interface WatchInfo {
  name: string;
  // display name, already resolved through LOG_SCOPE
  scope: string;
  // null = profiler default
  size: WatchCells | null;
  // false = console commands must not write through this watch
  editable: boolean;
}

export interface WatchSnapshot {
  frame: number;
  time: number;
  value: SerializedValue;
  error: boolean;
}

export type WatchMessage =
  | { type: "add"; watch: WatchInfo }
  | { type: "remove"; name: string }
  | ({ type: "value"; name: string } & WatchSnapshot);

export interface WatchState {
  watch: WatchInfo;
  value: WatchSnapshot | null;
}
