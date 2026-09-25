import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  GpuInfo,
  PerformanceSnapshot,
} from "../core/debugger/report";
import type { AuroraReport } from "../core/debugger/modules/aurora/report";
import type {
  LogEntry,
  LogMessage,
} from "../core/debugger/modules/log/report";
import type {
  WatchMessage,
  WatchState,
} from "../core/debugger/modules/watch/report";
import type {
  CommandCompleteQuery,
  CommandCompleteRequest,
  CommandCompleteResult,
  CommandCompletion,
  CommandEntry,
  CommandRegistryMessage,
} from "../core/debugger/modules/command/report";
import type {
  TweakInput,
  TweakMessage,
  TweakPanelInfo,
} from "../core/debugger/modules/tweak/report";

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
  toggleFullScreen: () => ipcRenderer.send("toggle-full-screen"),
  isFullScreen: async () =>
    (await ipcRenderer.invoke("is-full-screen")) as boolean,
  onFullScreenChanged: (callback: (bool: boolean) => void) =>
    ipcRenderer.on("window-full-screen-changed", (_, bool: boolean) =>
      callback(bool),
    ),
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
  //log
  sendLog: (message: LogMessage) => ipcRenderer.send("debug:log", message),
  onLog: (callback: (message: LogMessage) => void) => on("debug:log", callback),
  getLogHistory: () =>
    ipcRenderer.invoke("debug:logHistory") as Promise<LogEntry[]>,
  clearLogs: () => ipcRenderer.invoke("debug:logClear") as Promise<void>,
  dumpLogs: () => ipcRenderer.invoke("debug:logDump") as Promise<string>,
  crashGame: () => ipcRenderer.send("debug:crashGame"),
  //watch
  sendWatch: (message: WatchMessage) =>
    ipcRenderer.send("debug:watch", message),
  onWatchVisible: (callback: (names: string[]) => void) =>
    on("debug:watchVisible", callback),
  getWatchVisible: () =>
    ipcRenderer.invoke("debug:getWatchVisible") as Promise<string[]>,
  onWatch: (callback: (message: WatchMessage) => void) =>
    on("debug:watch", callback),
  getWatchState: () =>
    ipcRenderer.invoke("debug:watchState") as Promise<WatchState[]>,
  setWatchVisible: (names: string[]) =>
    ipcRenderer.send("debug:watchVisible", names),
  //command
  sendCommandRegistry: (message: CommandRegistryMessage) =>
    ipcRenderer.send("debug:command", message),
  onCommandRun: (callback: (text: string) => void) =>
    on("debug:commandRun", callback),
  onCommandComplete: (callback: (request: CommandCompleteRequest) => void) =>
    on("debug:commandComplete", callback),
  sendCommandCompleteResult: (result: CommandCompleteResult) =>
    ipcRenderer.send("debug:commandCompleteResult", result),
  onCommandRegistry: (callback: (message: CommandRegistryMessage) => void) =>
    on("debug:command", callback),
  getCommandRegistry: () =>
    ipcRenderer.invoke("debug:commandRegistry") as Promise<CommandEntry[]>,
  runCommand: (text: string) => ipcRenderer.send("debug:commandRun", text),
  completeCommand: (query: CommandCompleteQuery) =>
    ipcRenderer.invoke("debug:commandComplete", query) as Promise<
      CommandCompletion | null
    >,
  //tweak
  sendTweak: (message: TweakMessage) => ipcRenderer.send("debug:tweak", message),
  onTweak: (callback: (message: TweakMessage) => void) =>
    on("debug:tweak", callback),
  getTweakRegistry: () =>
    ipcRenderer.invoke("debug:tweakRegistry") as Promise<TweakPanelInfo[]>,
  sendTweakInput: (input: TweakInput) =>
    ipcRenderer.send("debug:tweakInput", input),
  onTweakInput: (callback: (input: TweakInput) => void) =>
    on("debug:tweakInput", callback),
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
