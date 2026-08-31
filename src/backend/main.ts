import { app, BrowserWindow } from "electron";
import { createGameWindow } from "./windows/game";
import started from "electron-squirrel-startup";
import { createConsoleWindow } from "./windows/profiler";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) app.quit();
app.on("ready", () => {
  createGameWindow();
  if (!app.isPackaged) createConsoleWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createGameWindow();
    if (!app.isPackaged) createConsoleWindow();
  }
});
