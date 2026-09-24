import { ipcMain } from "electron";
import { gameWindow } from "../windows/game";
import { sendToGame, sendToProfiler } from "../windows/profiler";
import {
  isRawCommand,
  parseCommand,
} from "../../core/debugger/modules/command/parse";
import type {
  CommandCompleteQuery,
  CommandCompleteResult,
  CommandCompletion,
  CommandEntry,
  CommandRegistryMessage,
} from "../../core/debugger/modules/command/report";

const COMMAND_IPC = {
  completeTimeoutMs: 300,
};

const registry = new Map<string, CommandEntry>();
const completions = {
  nextId: 0,
  pending: new Map<number, (completion: CommandCompletion | null) => void>(),
};

export function registerCommandIPC() {
  ipcMain.on("debug:command", (_, message: CommandRegistryMessage) => {
    if (message.type === "add") registry.set(message.entry.name, message.entry);
    else registry.delete(message.name);
    sendToProfiler("debug:command", message);
  });
  ipcMain.handle("debug:commandRegistry", () => [...registry.values()]);
  ipcMain.on("debug:commandRun", (_, text: string) => {
    if (isRawCommand(text)) runRaw(text);
    else sendToGame("debug:commandRun", text);
  });
  ipcMain.handle("debug:commandComplete", (_, query: CommandCompleteQuery) =>
    complete(query),
  );
  ipcMain.on(
    "debug:commandCompleteResult",
    (_, result: CommandCompleteResult) => {
      const resolve = completions.pending.get(result.id);
      if (!resolve) return;
      completions.pending.delete(result.id);
      resolve(result.completion);
    },
  );
}

export function resetCommandSession() {
  registry.clear();
}

function complete(query: CommandCompleteQuery) {
  const id = completions.nextId++;
  return new Promise<CommandCompletion | null>((resolve) => {
    completions.pending.set(id, resolve);
    sendToGame("debug:commandComplete", { id, query });
    // a game that is loading or frozen must not leave the profiler waiting
    setTimeout(() => {
      if (!completions.pending.delete(id)) return;
      resolve(null);
    }, COMMAND_IPC.completeTimeoutMs);
  });
}

// the game's CSP blocks eval / new Function, executeJavaScript is not subject to it
async function runRaw(text: string) {
  if (!gameWindow || gameWindow.isDestroyed()) return;
  const parsed = parseCommand(text);
  if (!parsed.ok || parsed.command.kind !== "raw") return;
  const code = parsed.command.code;
  const label = JSON.stringify(text);
  // newline before the closing bracket: a trailing // comment must not swallow it
  const wrap = (body: string) =>
    `(() => { const bridge = window.__debugCommand; if (!bridge) return; try { ${body} } catch (error) { bridge.report(${label}, error, true); } })()`;
  const contents = gameWindow.webContents;
  // a script that fails to compile runs nothing, so the flag has to be set by a separate call
  const setProbing = (probing: boolean) =>
    contents
      .executeJavaScript(`window.__debugCommand && (window.__debugCommand.probing = ${probing})`)
      .catch(() => {});
  await setProbing(true);
  try {
    await contents.executeJavaScript(
      wrap(`const value = (() => { with (bridge.roots()) return (${code}\n); })(); bridge.report(${label}, value, false);`),
    );
    await setProbing(false);
    return;
  } catch {
    // not an expression, runtime errors never get here: they are reported inside
  }
  try {
    await contents.executeJavaScript(
      wrap(`with (bridge.roots()) { ${code}\n } bridge.report(${label}, undefined, false);`),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    contents
      .executeJavaScript(
        `window.__debugCommand?.report(${label}, ${JSON.stringify(`syntax error: ${message}`)}, true)`,
      )
      .catch(() => {});
  } finally {
    await setProbing(false);
  }
}
