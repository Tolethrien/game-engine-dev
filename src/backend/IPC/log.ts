import { app, BrowserWindow, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import { sendToProfiler } from "../windows/profiler";
import {
  formatEntry,
  LOG_MIRROR_TAG,
} from "../../core/debugger/modules/log/format";
import type {
  LogEntry,
  LogLevel,
  LogMessage,
  SerializedValue,
} from "../../core/debugger/modules/log/report";

const LOG_BUFFER = {
  capacity: 100_000,
  dumpFolder: ".MisaLogs",
};

const CONSOLE_THROTTLE = {
  windowMs: 1000,
  bumpDelayMs: 250,
  maxKeys: 200,
};

// ring buffer; global ids are consecutive, so the id of the oldest entry is nextId - count
const buffer = {
  entries: new Array<LogEntry | undefined>(LOG_BUFFER.capacity),
  // game id of each slot, -1 for entries main adds itself
  gameIds: new Array<number>(LOG_BUFFER.capacity).fill(-1),
  start: 0,
  count: 0,
  nextId: 0,
};
// main interleaves its own entries (console-message) with the game's, so game ids map
// through a lookup; keys leave it together with their slot, so it never outgrows the buffer
const session = {
  ids: new Map<number, number>(),
  lastGameId: -1,
};
let lastFrame = 0;

interface ConsoleRepeat {
  id: number;
  since: number;
  count: number;
}
const consoleRepeats = {
  records: new Map<string, ConsoleRepeat>(),
  dirty: new Set<ConsoleRepeat>(),
  timer: null as ReturnType<typeof setTimeout> | null,
};
const CONSOLE_LEVEL: Record<string, LogLevel> = {
  debug: "log",
  info: "log",
  warning: "warn",
  error: "error",
};
// the full-buffer notice is sent once, again only after a clear
let fullNoticeSent = false;

export function registerLogIPC() {
  ipcMain.on("debug:log", (_, message: LogMessage) => {
    if (message.type === "entry") receiveEntry(message.entry);
    else receiveBump(message);
  });
  ipcMain.handle("debug:logHistory", () => history());
  ipcMain.handle("debug:logClear", () => {
    buffer.entries.fill(undefined);
    buffer.gameIds.fill(-1);
    session.ids.clear();
    buffer.start = 0;
    buffer.count = 0;
    fullNoticeSent = false;
  });
  ipcMain.handle("debug:logDump", () => dump());
  ipcMain.on("debug:crashGame", (event) =>
    event.sender.forcefullyCrashRenderer(),
  );

  // the Monitor variant leaves Node's default crash behaviour in place
  process.on("uncaughtExceptionMonitor", (error) =>
    mainLog("Main", "error", "main process exception", errorPart(error)),
  );
  // a listener disables Node's default report, so keep it in the terminal too
  process.on("unhandledRejection", (reason) => {
    console.error("unhandled rejection in main:", reason);
    mainLog("Main", "error", "main process unhandled rejection", valuePart(reason));
  });
}

export function watchGameWindow(window: BrowserWindow) {
  const contents = window.webContents;
  contents.on("console-message", (event) => {
    const { message, level, lineNumber, sourceId } = event;
    // the game logs its own richer entry for these (uncaught errors) or already sent them (mirror)
    if (message.startsWith("Uncaught") || message.startsWith(LOG_MIRROR_TAG))
      return;
    const parts = [textPart(message)];
    // line points into the Vite-transformed file, not the .ts source, so it is approximate
    if (sourceId) parts.push(textPart(`@ ${fileName(sourceId)}:${lineNumber}`));
    const scope = sourceId ? "Console" : "Chromium";
    consoleLog(
      `${scope}|${level}|${message}|${sourceId}:${lineNumber}`,
      scope,
      CONSOLE_LEVEL[level] ?? "log",
      parts,
    );
  });
  contents.on("render-process-gone", (_, details) =>
    mainLog(
      "Main",
      "error",
      `game process gone: ${details.reason} (exit ${details.exitCode})`,
    ),
  );
  window.on("unresponsive", () =>
    mainLog("Main", "warn", "game window not responding"),
  );
  window.on("responsive", () =>
    mainLog("Main", "notify", "game window responding again"),
  );
  contents.on(
    "did-fail-load",
    (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      mainLog(
        "Main",
        "error",
        `failed to load ${validatedURL}: ${errorDescription} (${errorCode})`,
      );
    },
  );
  contents.on("preload-error", (_, preloadPath, error) =>
    mainLog("Main", "error", `preload error in ${preloadPath}`, errorPart(error)),
  );
}

export function resetLogSession() {
  session.ids.clear();
  session.lastGameId = -1;
  // did-start-loading also fires on the first load
  if (buffer.nextId === 0) return;
  const entry: LogEntry = {
    kind: "separator",
    id: 0,
    time: Date.now(),
    label: "game reloaded",
    reload: true,
  };
  pushAndSend(entry);
}

function receiveEntry(entry: LogEntry) {
  const gameId = entry.id;
  if (entry.kind !== "separator") lastFrame = entry.frame;
  // self-heals a reload without the separator hook: game ids only grow within a session
  if (gameId <= session.lastGameId) session.ids.clear();
  session.lastGameId = gameId;
  pushAndSend(entry, gameId);
  session.ids.set(gameId, entry.id);
}

function sendFullNotice() {
  fullNoticeSent = true;
  const time = Date.now();
  pushAndSend({
    kind: "separator",
    id: 0,
    time,
    label: "log buffer full",
    reload: false,
  });
  pushAndSend({
    kind: "entry",
    id: 0,
    frame: lastFrame,
    time,
    scope: "debug",
    level: "warn",
    parts: [
      {
        type: "string",
        value: `log buffer full (${LOG_BUFFER.capacity} entries): from here on the oldest entries are removed, history and dump keep only the latest ${LOG_BUFFER.capacity}`,
        more: 0,
      },
    ],
  });
}

function receiveBump(message: Extract<LogMessage, { type: "bump" }>) {
  const id = session.ids.get(message.id);
  if (id === undefined) return;
  const entry = get(id);
  if (!entry || entry.kind !== "entry") return;
  entry.suppressed = message.suppressed;
  sendToProfiler("debug:log", { ...message, id } satisfies LogMessage);
}

function pushAndSend(entry: LogEntry, gameId = -1) {
  push(entry, gameId);
  sendToProfiler("debug:log", { type: "entry", entry } satisfies LogMessage);
  if (buffer.count === LOG_BUFFER.capacity && !fullNoticeSent) sendFullNotice();
}

function mainLog(
  scope: string,
  level: LogLevel,
  message: string,
  ...details: SerializedValue[]
) {
  return pushMainEntry(scope, level, [textPart(message), ...details]);
}

function pushMainEntry(scope: string, level: LogLevel, parts: SerializedValue[]) {
  const entry: LogEntry = {
    kind: "entry",
    id: 0,
    frame: lastFrame,
    time: Date.now(),
    scope,
    level,
    parts,
  };
  pushAndSend(entry);
  return entry.id;
}

// main has no handles, so repeats of the same line are counted here: console.log in the game
// loop would otherwise flood IPC and the buffer, collapsing in the profiler happens too late
function consoleLog(
  key: string,
  scope: string,
  level: LogLevel,
  parts: SerializedValue[],
) {
  const now = Date.now();
  const repeat = consoleRepeats.records.get(key);
  if (repeat && now - repeat.since < CONSOLE_THROTTLE.windowMs) {
    repeat.count++;
    consoleRepeats.dirty.add(repeat);
    consoleRepeats.timer ??= setTimeout(
      flushConsoleBumps,
      CONSOLE_THROTTLE.bumpDelayMs,
    );
    return;
  }
  if (repeat) sendConsoleBump(repeat);
  if (consoleRepeats.records.size >= CONSOLE_THROTTLE.maxKeys) {
    flushConsoleBumps();
    consoleRepeats.records.clear();
  }
  consoleRepeats.records.set(key, {
    id: pushMainEntry(scope, level, parts),
    since: now,
    count: 0,
  });
}

function flushConsoleBumps() {
  consoleRepeats.timer = null;
  consoleRepeats.dirty.forEach(sendConsoleBump);
}

function sendConsoleBump(record: ConsoleRepeat) {
  if (!consoleRepeats.dirty.delete(record)) return;
  const entry = get(record.id);
  if (!entry || entry.kind !== "entry") return;
  entry.suppressed = { count: record.count, reason: "throttle" };
  sendToProfiler("debug:log", {
    type: "bump",
    id: record.id,
    suppressed: entry.suppressed,
  } satisfies LogMessage);
}

function textPart(value: string): SerializedValue {
  return { type: "string", value, more: 0 };
}

function errorPart(error: Error): SerializedValue {
  return {
    type: "error",
    name: error.name,
    message: error.message,
    stack: error.stack ?? "",
  };
}

function valuePart(value: unknown): SerializedValue {
  if (value instanceof Error) return errorPart(value);
  try {
    return textPart(String(value));
  } catch {
    return textPart(typeof value);
  }
}

function fileName(sourceId: string) {
  const path = sourceId.split(/[?#]/)[0];
  return path.slice(path.lastIndexOf("/") + 1) || sourceId;
}

function push(entry: LogEntry, gameId: number) {
  entry.id = buffer.nextId++;
  const index = (buffer.start + buffer.count) % LOG_BUFFER.capacity;
  const evicted = buffer.entries[index];
  const evictedGameId = buffer.gameIds[index];
  if (evicted && evictedGameId >= 0 && session.ids.get(evictedGameId) === evicted.id)
    session.ids.delete(evictedGameId);
  buffer.entries[index] = entry;
  buffer.gameIds[index] = gameId;
  if (buffer.count < LOG_BUFFER.capacity) buffer.count++;
  else buffer.start = (buffer.start + 1) % LOG_BUFFER.capacity;
}

function get(id: number) {
  const offset = id - (buffer.nextId - buffer.count);
  if (offset < 0 || offset >= buffer.count) return undefined;
  return buffer.entries[(buffer.start + offset) % LOG_BUFFER.capacity];
}

function history() {
  const result: LogEntry[] = new Array(buffer.count);
  for (let offset = 0; offset < buffer.count; offset++)
    result[offset] =
      buffer.entries[(buffer.start + offset) % LOG_BUFFER.capacity]!;
  return result;
}

async function dump() {
  const folder = path.join(app.getAppPath(), LOG_BUFFER.dumpFolder);
  await fs.mkdir(folder, { recursive: true });
  const file = path.join(folder, `${dumpName(new Date())}.txt`);
  await fs.writeFile(file, history().map(formatEntry).join("\n"), "utf8");
  return file;
}

function dumpName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
