import { ipcMain, screen } from "electron";
import { gameWindow } from "../windows/game";
const MIN_W = 960;
const ASPECT = 16 / 9;

export type WindowMode = "fullScreen" | "border" | "borderless";
export function registerWindowEventsIPC() {
  getWindowSize();
  getRefreshRate();
  resizeEvents();
  focusEvents();
}

function resizeEvents() {
  const sendSize = () => {
    const [width, height] = gameWindow.getContentSize();
    gameWindow.webContents.send("window-resized", { width, height } as Size2D);
  };
  gameWindow.on("will-resize", (event, newSize) => {
    const bound = gameWindow.getBounds();
    const content = gameWindow.getContentSize();
    const frameOffsetW = bound.width - content[0];
    const newContentW = Math.max(newSize.width - frameOffsetW, MIN_W);
    const newContentH = Math.round(newContentW / ASPECT);
    event.preventDefault();
    gameWindow.setContentSize(newContentW, newContentH);
    const size: Size2D = { width: newContentW, height: newContentH };
    gameWindow.webContents.send("window-resized", size);
  });
  gameWindow.on("maximize", sendSize);
  gameWindow.on("unmaximize", sendSize);
  //full screen have animation before change, need to wait and let debounce handle time before change
  gameWindow.on("enter-full-screen", () => setTimeout(sendSize, 0));
  gameWindow.on("leave-full-screen", () => setTimeout(sendSize, 0));
  ipcMain.on("set-full-screen", (_, bool: boolean) =>
    gameWindow.setFullScreen(bool),
  );
}

function focusEvents() {
  gameWindow.on("focus", () =>
    gameWindow.webContents.send("window-focus-changed", true),
  );
  gameWindow.on("blur", () =>
    gameWindow.webContents.send("window-focus-changed", false),
  );
}
function getWindowSize() {
  ipcMain.handle("get-window-size", () => {
    const [width, height] = gameWindow.getContentSize();
    return { width, height } as Size2D;
  });
}
function getRefreshRate() {
  ipcMain.handle("get-refresh-rate", () => {
    const display = screen.getDisplayMatching(gameWindow.getBounds());
    return Math.round(display.displayFrequency) || 60;
  });
}
