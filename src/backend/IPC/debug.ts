import { ipcMain } from "electron";
import { profilerWindow } from "../windows/profiler";

const DEBUG_CHANNELS = ["debug:performance", "debug:aurora"] as const;

export function registerDebugIPC() {
  DEBUG_CHANNELS.forEach((channel) => {
    ipcMain.on(channel, (_, data) =>
      profilerWindow?.webContents.send(channel, data),
    );
  });
}
