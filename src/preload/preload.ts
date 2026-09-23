import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

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
  getRefreshRate: async () =>
    (await ipcRenderer.invoke("get-refresh-rate")) as number,
};
const DEBUG = {
  //perf
  sendPerformanceSnapshot: (data: PerformanceSnapshot) =>
    ipcRenderer.send("debug:performance", data),
  onPerformanceSnapshot: (callback: (data: PerformanceSnapshot) => void) =>
    on("debug:performance", callback),
  //aurora
  sendAuroraReport: (data: AuroraReport) =>
    ipcRenderer.send("debug:aurora", data),
  onAuroraReport: (callback: (data: AuroraReport) => void) =>
    on("debug:aurora", callback),
  //reload
  onGameReloaded: (callback: () => void) => on("debug:gameReloaded", callback),
  onProfilerState: (callback: (isOpen: boolean) => void) =>
    on("debug:profilerState", callback),
  getProfilerState: () =>
    ipcRenderer.invoke("debug:getProfilerState") as Promise<boolean>,
  getGpuInfo: () => ipcRenderer.invoke("debug:getGpuInfo") as Promise<GpuInfo>,
  openProfiler: () => ipcRenderer.send("openProfiler"),
};

const PROFILER = {
  setTitleBarColors: (colors: { color: string; symbolColor: string }) =>
    ipcRenderer.send("profiler:setTitleBarColors", colors),
};

export const API = {
  WINDOW,
  DEBUG,
  PROFILER,
};
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("API", API);
  } catch (error) {
    console.error(error);
  }
}

//helpers

//send off to profiler to clear
const on = <T>(channel: string, callback: (data: T) => void) => {
  const handler = (_: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
};
