import { BrowserWindow, globalShortcut, ipcMain, webContents } from "electron";
import path from "path";
import { registerWindowEventsIPC } from "../IPC/window";

export let mainWindow: BrowserWindow;

export function createGameWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.setMenu(null);
  mainWindow.setBackgroundColor("rgba(0,0,0,1)");
  mainWindow.setAspectRatio(16 / 9);
  registerWindowEventsIPC();
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    onDevServer();
  } else {
    onProd();
  }
}
function onDevServer() {
  mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  mainWindow.maximize();
  globalShortcut.register("CommandOrControl+R", () => {
    mainWindow.reload();
  });
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    mainWindow.webContents.toggleDevTools();
  });
  mainWindow.webContents.openDevTools({
    mode: "detach",
    activate: false,
    title: "Misa Devtools",
  });
}
function onProd() {
  mainWindow.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
  );
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    mainWindow.webContents.toggleDevTools();
  });
  mainWindow.webContents.openDevTools({
    mode: "detach",
    activate: false,
    title: "Misa Devtools",
  });
  // mainWindow.setFullScreen(true);
}
