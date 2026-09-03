import { app, BrowserWindow, ipcMain } from "electron";
import { createGameWindow } from "./windows/game";
import started from "electron-squirrel-startup";
import { createProfilerWindow, openProfilerWindow } from "./windows/profiler";
import { registerDebugIPC } from "./IPC/debug";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) app.quit();
app.on("ready", () => {
  createGameWindow();
  if (!app.isPackaged) {
    registerDebugIPC();
    ipcMain.on("openProfiler", openProfilerWindow);
    createProfilerWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createGameWindow();
    if (!app.isPackaged) openProfilerWindow();
  }
});
