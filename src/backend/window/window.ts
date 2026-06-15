import { BrowserWindow, globalShortcut } from "electron";
import path from "path";

export let mainWindow: BrowserWindow;

export function createGameWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    // useContentSize: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.setMenu(null);
  mainWindow.setBackgroundColor("rgba(0,0,0,1)");
  mainWindow.setAspectRatio(16 / 9);
  setResizeToRatioEvent();
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    onDevServer();
  } else {
    onProd();
  }
}
function onDevServer() {
  mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  mainWindow.resizable = true;
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
  mainWindow.setFullScreen(true);
}
function setResizeToRatioEvent() {
  mainWindow.on("will-resize", (event, newBounds) => {
    const MIN_W = 960;
    const ASPECT = 16 / 9;
    let w = Math.max(newBounds.width, MIN_W);
    let h = Math.round(w / ASPECT);
    event.preventDefault();
    mainWindow.setBounds({ width: w, height: h });
  });
}
