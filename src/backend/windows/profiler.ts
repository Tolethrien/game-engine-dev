import { BrowserWindow, screen } from "electron";
import path from "path";
import { loadRenderer } from "./loader";
import { gameWindow } from "./game";
export let profilerWindow: BrowserWindow | undefined;

export function createProfilerWindow() {
  profilerWindow = new BrowserWindow({
    ...getDockBounds(),
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
  sendToGame("debug:profilerState", true);
  profilerWindow.on("closed", () => {
    profilerWindow = undefined;
    sendToGame("debug:profilerState", false);
  });
}
function onDevServer() {
  profilerWindow?.webContents.on("before-input-event", (_event, input) => {
    if (input.control && input.key.toLowerCase() === "r")
      profilerWindow?.reload();
    if (input.control && input.shift && input.key.toLowerCase() === "i")
      profilerWindow?.webContents.toggleDevTools();
  });
  // profilerWindow?.webContents.openDevTools({
  //   mode: "right",
  //   activate: false,
  //   title: "Misa Profiler Devtools",
  // });
}
export function sendToProfiler(channel: string, data?: unknown) {
  if (!profilerWindow || profilerWindow.isDestroyed()) return;
  profilerWindow.webContents.send(channel, data);
}
export function sendToGame(channel: string, data?: unknown) {
  if (!gameWindow || gameWindow.isDestroyed()) return;
  gameWindow.webContents.send(channel, data);
}
export function openProfilerWindow() {
  if (profilerWindow && !profilerWindow.isDestroyed()) {
    profilerWindow.focus();
    return;
  }
  createProfilerWindow();
}

function getDockBounds() {
  const DOCK_WIDTH_RATIO = 0.3;
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.round(workArea.width * DOCK_WIDTH_RATIO);
  return {
    x: workArea.x + workArea.width - width,
    y: workArea.y,
    width,
    height: workArea.height,
  };
}
