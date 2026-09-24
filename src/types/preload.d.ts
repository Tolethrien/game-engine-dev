import { API } from "../preload/preload";
declare global {
  interface Window {
    API: typeof API;
    openProfiler?: () => void;
    // bridge for raw ("> code") console commands, main runs them through executeJavaScript
    __debugCommand?: {
      roots: () => object;
      report: (text: string, value: unknown, error: boolean) => void;
      // main is test-compiling a raw command, its SyntaxError is expected, not a game error
      probing: boolean;
    };
  }
}
