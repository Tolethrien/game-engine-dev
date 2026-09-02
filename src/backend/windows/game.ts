import { BrowserWindow, globalShortcut } from "electron";
import path from "path";
import { registerWindowEventsIPC } from "../IPC/gameWindow";
import { loadRenderer } from "./loader";
import { profilerWindow } from "./profiler";

export let gameWindow: BrowserWindow;

export function createGameWindow() {
  gameWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  gameWindow.setMenu(null);
  gameWindow.setBackgroundColor("rgba(0,0,0,1)");
  gameWindow.setAspectRatio(16 / 9);
  registerWindowEventsIPC();
  loadRenderer(gameWindow, {
    devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    viteName: MAIN_WINDOW_VITE_NAME,
    htmlFile: "index.html",
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) onDevServer();
}
function onDevServer() {
  gameWindow.maximize();
  gameWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.control && input.key.toLowerCase() === "r") gameWindow.reload();
    if (input.control && input.shift && input.key.toLowerCase() === "i")
      gameWindow.webContents.toggleDevTools();
  });
  gameWindow.webContents.openDevTools({
    mode: "detach",
    activate: false,
    title: "Misa Devtools",
  });
  gameWindow.webContents.on("did-start-loading", () => {
    profilerWindow?.webContents.send("debug:gameReloaded");
  });
}
