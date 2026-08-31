import { BrowserWindow } from "electron";
import path from "path";

interface RendererTarget {
  devServerUrl: string | undefined; // DEBUG_WINDOW_VITE_DEV_SERVER_URL
  viteName: string; // DEBUG_WINDOW_VITE_NAME
  htmlFile: string; // "index.html" | "debug.html"
}

export function loadRenderer(win: BrowserWindow, target: RendererTarget) {
  if (target.devServerUrl) {
    win.loadURL(`${target.devServerUrl}/${target.htmlFile}`);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${target.viteName}/${target.htmlFile}`),
    );
  }
}
