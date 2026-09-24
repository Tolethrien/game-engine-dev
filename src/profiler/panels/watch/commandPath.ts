import { isMoreLabel } from "@/core/debugger/modules/log/format";
import type { SerializedValue } from "@/core/debugger/modules/log/report";
import type { PathKey } from "@/core/debugger/modules/command/parse";

// where a row sits relative to a Map: its [[entries]] list, one entry, or neither
export interface PathState {
  path: PathKey[] | null;
  role: "plain" | "mapEntries" | "mapEntry";
  mapPath: PathKey[] | null;
  entryKey: PathKey | null;
}

const UNADDRESSABLE: PathState = { path: null, role: "plain", mapPath: null, entryKey: null };
const INDEX = /^\d+$/;

export function rootPathState(path: PathKey[] | null): PathState {
  return path ? { ...UNADDRESSABLE, path } : UNADDRESSABLE;
}

// only string and finite number keys can be typed in a command
function entryKey(entry: SerializedValue): PathKey | null {
  if (entry.type !== "object") return null;
  const key = entry.entries.find(([name]) => name === "key")?.[1];
  if (key?.type === "string" && key.more === 0) return key.value;
  if (key?.type === "number" && typeof key.value === "number" && Number.isFinite(key.value))
    return key.value;
  return null;
}

export function childPathState(
  parent: SerializedValue,
  state: PathState,
  label: string,
  child: SerializedValue,
): PathState {
  if (isMoreLabel(label)) return UNADDRESSABLE;
  if (state.role === "mapEntries")
    return { path: null, role: "mapEntry", mapPath: state.mapPath, entryKey: entryKey(child) };
  if (state.role === "mapEntry") {
    if (label === "value" && state.mapPath && state.entryKey !== null)
      return rootPathState([...state.mapPath, state.entryKey]);
    return UNADDRESSABLE;
  }
  switch (parent.type) {
    case "map":
      return { path: null, role: "mapEntries", mapPath: state.path, entryKey: null };
    case "object":
    case "error":
      return rootPathState(state.path && [...state.path, label]);
    case "array":
      return rootPathState(
        state.path && INDEX.test(label) ? [...state.path, Number(label)] : null,
      );
    default:
      return UNADDRESSABLE;
  }
}
