import { ipcMain } from "electron";
import { mainWindow } from "../window/window";
const MIN_W = 960;
const ASPECT = 16 / 9;

export type WindowMode = "fullScreen" | "border" | "borderless";
export function registerWindowEventsIPC() {
  getWindowSize();
  resizeEvents();
  focusEvents();
}

function resizeEvents() {
  const sendSize = () => {
    const [width, height] = mainWindow.getContentSize();
    mainWindow.webContents.send("window-resized", { width, height } as Size2D);
  };
  mainWindow.on("will-resize", (event, newSize) => {
    const bound = mainWindow.getBounds();
    const content = mainWindow.getContentSize();
    const frameOffsetW = bound.width - content[0];
    const newContentW = Math.max(newSize.width - frameOffsetW, MIN_W);
    const newContentH = Math.round(newContentW / ASPECT);
    event.preventDefault();
    mainWindow.setContentSize(newContentW, newContentH);
    const size: Size2D = { width: newContentW, height: newContentH };
    mainWindow.webContents.send("window-resized", size);
  });
  mainWindow.on("maximize", sendSize);
  mainWindow.on("unmaximize", sendSize);
  //full screen have animation before change, need to wait and let debounce handle time before change
  mainWindow.on("enter-full-screen", () => setTimeout(sendSize, 0));
  mainWindow.on("leave-full-screen", () => setTimeout(sendSize, 0));
  ipcMain.on("set-full-screen", (_, bool: boolean) =>
    mainWindow.setFullScreen(bool),
  );
}

function focusEvents() {
  mainWindow.on("focus", () =>
    mainWindow.webContents.send("window-focus-changed", true),
  );
  mainWindow.on("blur", () =>
    mainWindow.webContents.send("window-focus-changed", false),
  );
}
function getWindowSize() {
  ipcMain.handle("get-window-size", () => {
    const [width, height] = mainWindow.getContentSize();
    return { width, height } as Size2D;
  });
}
