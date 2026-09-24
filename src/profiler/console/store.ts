import { createSignal } from "solid-js";
import {
  formatParts,
  hasDetails,
} from "@/core/debugger/modules/log/format";
import type {
  LogEntry,
  LogLevel,
  LogMessage,
  LogSuppressed,
} from "@/core/debugger/modules/log/report";
import {
  formatParseError,
  callRoots,
  parseCommand,
  type ParsedCommand,
} from "@/core/debugger/modules/command/parse";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { watchStore } from "../watch/store";
import { commandHistory } from "./command/history";
import { commandRegistry } from "./command/registry";
import { completion } from "./command/completion";
import { watchLocks } from "./command/locks";

export const CONSOLE = {
  maxEntries: 100_000,
  rowHeight: 18,
  previewLength: 200,
  toastMs: 3000,
};

export const LEVELS: LogLevel[] = ["error", "warn", "success", "notify", "log"];
export const LEVEL_STYLE: Record<
  LogLevel,
  { letter: string; text: string; bar: string }
> = {
  error: { letter: "E", text: "text-error", bar: "bg-error" },
  warn: { letter: "W", text: "text-warn", bar: "bg-warn" },
  success: { letter: "S", text: "text-success", bar: "bg-success" },
  notify: { letter: "N", text: "text-notify", bar: "bg-notify" },
  log: { letter: "L", text: "text-fg", bar: "bg-fg-dim" },
};

export interface ConsoleEntry {
  source: LogEntry;
  text: string;
  searchText: string;
  hasObject: boolean;
  multiline: boolean;
  repeat: number;
  suppressed: LogSuppressed | null;
}

function emptyCounts(): Record<LogLevel, number> {
  return { error: 0, warn: 0, success: 0, notify: 0, log: 0 };
}

let entries: ConsoleEntry[] = [];
let byId = new Map<number, ConsoleEntry>();
let counts = emptyCounts();
let objectCount = 0;
let scopes: string[] = [];
let lastKey: string | null = null;
let queue: LogMessage[] = [];
let scheduled = false;
let ready = false;
let maxHistoryId = -1;

const [version, setVersion] = createSignal(0);
const [hiddenLevels, setHiddenLevels] = useLocalStorage<string[]>(
  "console:hiddenLevels",
  [],
);
const [hiddenScopes, setHiddenScopes] = useLocalStorage<string[]>(
  "console:hiddenScopes",
  [],
);
const [objectsOnly, setObjectsOnly] = useLocalStorage<boolean>(
  "console:objectsOnly",
  false,
);
const [keep, setKeep] = useLocalStorage<boolean>("console:keep", false);
const [query, setQuery] = createSignal("");
const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
const [toast, setToast] = createSignal("");
export const [draft, setDraft] = createSignal("");
export const [commandError, setCommandError] = createSignal("");
// the id makes two inserts of the same text two separate requests
export const [insertRequest, setInsertRequest] = createSignal<{ text: string; id: number } | null>(null);
let insertId = 0;

export function insertCommandText(text: string) {
  setInsertRequest({ text, id: ++insertId });
}

export {
  version,
  query,
  setQuery,
  hiddenLevels,
  hiddenScopes,
  objectsOnly,
  setObjectsOnly,
  keep,
  setKeep,
  expanded,
  toast,
};

export function getEntries(): readonly ConsoleEntry[] {
  version();
  return entries;
}

export function getCounts() {
  version();
  return counts;
}

export function getObjectCount() {
  version();
  return objectCount;
}

export function getScopes() {
  version();
  return scopes;
}

function resetLocal() {
  entries = [];
  byId = new Map();
  counts = emptyCounts();
  objectCount = 0;
  scopes = [];
  lastKey = null;
  setExpanded(new Set<string>());
}

function push(source: LogEntry, text: string, scope: string) {
  const entry: ConsoleEntry = {
    source,
    text,
    searchText: `${scope} ${text}`.toLowerCase(),
    hasObject: false,
    multiline: text.includes("\n"),
    repeat: 1,
    suppressed: null,
  };
  entries.push(entry);
  byId.set(source.id, entry);
  return entry;
}

// history ignores `keep`: after a profiler reload every buffered session comes back
function addEntry(source: LogEntry, live: boolean) {
  if (source.kind === "separator") {
    if (live && source.reload && !keep()) resetLocal();
    push(source, source.label, "");
    lastKey = null;
    return;
  }
  if (source.kind === "valve") {
    push(
      source,
      `dropped ${source.dropped} logs in frame ${source.frame}`,
      "debug",
    );
    lastKey = null;
    return;
  }

  const key = `${source.level}|${source.scope}|${JSON.stringify(source.parts)}`;
  const last = entries[entries.length - 1];
  if (key === lastKey && last && last.source.kind === "entry") {
    last.repeat++;
    counts[source.level]++;
    if (last.hasObject) objectCount++;
    return;
  }

  const entry = push(source, formatParts(source.parts), source.scope);
  entry.hasObject = source.parts.some(hasDetails);
  counts[source.level]++;
  if (!scopes.includes(source.scope)) scopes.push(source.scope);
  if (entry.hasObject) objectCount++;
  lastKey = key;
}

function trim() {
  const excess = entries.length - CONSOLE.maxEntries;
  if (excess <= 0) return;
  for (const entry of entries.splice(0, excess)) {
    byId.delete(entry.source.id);
    if (entry.source.kind !== "entry") continue;
    counts[entry.source.level] -= entry.repeat;
    if (entry.hasObject) objectCount -= entry.repeat;
  }
}

function flush() {
  scheduled = false;
  for (const message of queue) {
    if (message.type === "entry") {
      if (message.entry.id <= maxHistoryId) continue;
      addEntry(message.entry, true);
    } else {
      const entry = byId.get(message.id);
      if (entry) entry.suppressed = message.suppressed;
    }
  }
  queue.length = 0;
  trim();
  setVersion((value) => value + 1);
}

function schedule() {
  if (scheduled || !ready) return;
  scheduled = true;
  requestAnimationFrame(flush);
}

window.API.DEBUG.onLog((message) => {
  queue.push(message);
  schedule();
});

window.API.DEBUG.getLogHistory().then((history) => {
  for (const entry of history) {
    addEntry(entry, false);
    maxHistoryId = Math.max(maxHistoryId, entry.id);
  }
  ready = true;
  schedule();
});

export function clearConsole() {
  window.API.DEBUG.clearLogs();
  resetLocal();
  setVersion((value) => value + 1);
}

export async function dumpConsole() {
  const path = await window.API.DEBUG.dumpLogs();
  setToast(`saved ${path}`);
  setTimeout(() => setToast(""), CONSOLE.toastMs);
}

function toggleHidden(
  hidden: string[],
  all: string[],
  item: string,
  solo: boolean,
): string[] {
  if (!solo)
    return hidden.includes(item)
      ? hidden.filter((entry) => entry !== item)
      : [...hidden, item];
  const others = all.filter((entry) => entry !== item);
  const isOnlyVisible = others.every((entry) => hidden.includes(entry));
  return isOnlyVisible ? [] : others;
}

export function toggleLevel(level: LogLevel, solo: boolean) {
  setHiddenLevels(toggleHidden(hiddenLevels(), LEVELS, level, solo));
}

export function toggleScope(scope: string, solo: boolean) {
  setHiddenScopes(toggleHidden(hiddenScopes(), getScopes(), scope, solo));
}

export function setAllScopesVisible(visible: boolean) {
  setHiddenScopes(visible ? [] : [...getScopes()]);
}

export function toggleExpanded(key: string) {
  const next = new Set(expanded());
  if (!next.delete(key)) next.add(key);
  setExpanded(next);
}

export function filterEntries(): ConsoleEntry[] {
  version();
  const levelsOff = hiddenLevels();
  const scopesOff = hiddenScopes();
  const onlyObjects = objectsOnly();
  const needle = query().trim().toLowerCase();
  return entries.filter((entry) => {
    const source = entry.source;
    if (source.kind === "separator") return true;
    if (source.kind === "valve") return !levelsOff.includes("warn");
    if (levelsOff.includes(source.level)) return false;
    if (scopesOff.includes(source.scope)) return false;
    if (onlyObjects && !entry.hasObject) return false;
    if (needle && !entry.searchText.includes(needle)) return false;
    return true;
  });
}

export function submitDraft() {
  const text = draft().trim();
  if (!text) return;
  const parsed = parseCommand(text);
  if (!parsed.ok) {
    setCommandError(formatParseError(text, parsed));
    return;
  }
  const locked = lockedWatch(parsed.command);
  if (locked) {
    setCommandError(`"${locked}" is locked in the profiler, unlock it in its watch panel`);
    return;
  }
  setCommandError("");
  window.API.DEBUG.runCommand(text);
  commandHistory.push(text);
  completion.clearMembers();
  completion.close();
  setDraft("");
}

// soft lock only; editable: false is checked by the game itself
function lockedWatch(command: ParsedCommand) {
  const names = callRoots(command);
  if (command.kind === "assign" || command.kind === "update")
    names.push(String(command.target[0]));
  // a plain read of a locked watch is fine, writes and calls are not
  return (
    names.find(
      (name) =>
        !commandRegistry.find(name) && watchStore.has(name) && watchLocks.isLocked(name),
    ) ?? null
  );
}
