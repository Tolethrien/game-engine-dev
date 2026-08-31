import { BrowserWindow, globalShortcut } from "electron";
import path from "path";
import { loadRenderer } from "./loader";
import { registerDebugIPC } from "../IPC/debug";
export let profilerWindow: BrowserWindow;
export function createConsoleWindow() {
  profilerWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  profilerWindow.setMenu(null);
  profilerWindow.setBackgroundColor("rgba(0,0,0,1)");
  loadRenderer(profilerWindow, {
    devServerUrl: PROFILER_WINDOW_VITE_DEV_SERVER_URL,
    viteName: PROFILER_WINDOW_VITE_NAME,
    htmlFile: "index_profiler.html",
  });
  if (PROFILER_WINDOW_VITE_DEV_SERVER_URL) onDevServer();
  registerDebugIPC();
}
function onDevServer() {
  profilerWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.control && input.key.toLowerCase() === "r")
      profilerWindow.reload();
    if (input.control && input.shift && input.key.toLowerCase() === "i")
      profilerWindow.webContents.toggleDevTools();
  });
  profilerWindow.webContents.openDevTools({
    mode: "right",
    activate: false,
    title: "Misa Profiler Devtools",
  });
}
