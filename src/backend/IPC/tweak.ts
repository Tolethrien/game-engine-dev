import { ipcMain } from "electron";
import { sendToGame, sendToProfiler } from "../windows/profiler";
import type {
  TweakInput,
  TweakMessage,
  TweakPanelInfo,
} from "../../core/debugger/modules/tweak/report";

// kept for a profiler that opens after the game registered its panels
const registry = new Map<string, TweakPanelInfo>();

export function registerTweakIPC() {
  ipcMain.on("debug:tweak", (_, message: TweakMessage) => {
    if (message.type === "add") registry.set(message.panel.name, message.panel);
    else if (message.type === "remove") registry.delete(message.name);
    sendToProfiler("debug:tweak", message);
  });
  ipcMain.handle("debug:tweakRegistry", () => [...registry.values()]);
  ipcMain.on("debug:tweakInput", (_, input: TweakInput) =>
    sendToGame("debug:tweakInput", input),
  );
}

export function resetTweakSession() {
  registry.clear();
}
