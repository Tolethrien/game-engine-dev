import { contextBridge, ipcRenderer } from "electron";

const WINDOW = {
  onWindowResize: (callback: (size: Size2D) => void) =>
    ipcRenderer.on("window-resized", (_, value: Size2D) => callback(value)),
  getWindowSize: async () =>
    (await ipcRenderer.invoke("get-window-size")) as Promise<Size2D>,
  onFocusChanged: (callback: (bool: boolean) => void) =>
    ipcRenderer.on("window-focus-changed", (_, bool: boolean) =>
      callback(bool),
    ),
  setFullScreen: (bool: boolean) => ipcRenderer.send("set-full-screen", bool),
};
const DEBUG = {
  sendPerformanceSnapshot: (data: PerformanceSnapshot) =>
    ipcRenderer.send("debug:performance", data),
  onPerformanceSnapshot: (callback: (data: PerformanceSnapshot) => void) =>
    ipcRenderer.on("debug:performance", (_, data: PerformanceSnapshot) =>
      callback(data),
    ),
  onGameReloaded: (callback: () => void) =>
    ipcRenderer.on("debug:gameReloaded", () => callback()),
};

export const API = {
  WINDOW,
  DEBUG,
};
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("API", API);
  } catch (error) {
    console.error(error);
  }
}
