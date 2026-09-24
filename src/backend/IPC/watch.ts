import { ipcMain } from "electron";
import { sendToGame, sendToProfiler } from "../windows/profiler";
import type {
  WatchMessage,
  WatchState,
} from "../../core/debugger/modules/watch/report";

// Map keeps insertion order, which is the registration order the profiler shows
const registry = new Map<string, WatchState>();
let visible: string[] = [];

export function registerWatchIPC() {
  ipcMain.on("debug:watch", (_, message: WatchMessage) => {
    receive(message);
    sendToProfiler("debug:watch", message);
  });
  ipcMain.handle("debug:watchState", () => [...registry.values()]);
  ipcMain.on("debug:watchVisible", (_, names: string[]) => {
    visible = names;
    sendToGame("debug:watchVisible", names);
  });
  ipcMain.handle("debug:getWatchVisible", () => visible);
}

// visible stays: it is the profiler's state, not the game's
export function resetWatchSession() {
  registry.clear();
}

// the profiler sends its set again once it opens
export function clearWatchVisible() {
  visible = [];
  sendToGame("debug:watchVisible", visible);
}

function receive(message: WatchMessage) {
  switch (message.type) {
    case "add": {
      const previous = registry.get(message.watch.name);
      if (previous) previous.watch = message.watch;
      else registry.set(message.watch.name, { watch: message.watch, value: null });
      return;
    }
    case "remove":
      registry.delete(message.name);
      return;
    case "value": {
      const state = registry.get(message.name);
      if (!state) return;
      const { frame, time, value, error } = message;
      state.value = { frame, time, value, error };
      return;
    }
  }
}
