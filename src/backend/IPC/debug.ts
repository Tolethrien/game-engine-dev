import { ipcMain } from "electron";
import { sendToProfiler } from "../windows/profiler";

const DEBUG_CHANNELS = ["debug:performance", "debug:aurora"] as const;

export function registerDebugIPC() {
  DEBUG_CHANNELS.forEach((channel) => {
    ipcMain.on(channel, (_, data) => sendToProfiler(channel, data));
  });
}
