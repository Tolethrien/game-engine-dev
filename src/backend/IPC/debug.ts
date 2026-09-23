import { app, ipcMain } from "electron";
import {
  profilerWindow,
  sendToProfiler,
  setProfilerTitleBarColors,
} from "../windows/profiler";

const DEBUG_CHANNELS = ["debug:performance", "debug:aurora"] as const;

export function registerDebugIPC() {
  DEBUG_CHANNELS.forEach((channel) => {
    ipcMain.on(channel, (_, data) => sendToProfiler(channel, data));
  });
  ipcMain.on("profiler:setTitleBarColors", (_, colors) =>
    setProfilerTitleBarColors(colors),
  );
  ipcMain.handle(
    "debug:getProfilerState",
    () => profilerWindow !== undefined && !profilerWindow.isDestroyed(),
  );
  ipcMain.handle("debug:getGpuInfo", () => app.getGPUInfo("complete"));
}
