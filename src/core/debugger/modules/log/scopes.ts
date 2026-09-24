export const LOG_SCOPE = {
  // sandbox tests
  sandbox: "Sandbox",
  consoleTest: "ConsoleTest",
  captureTest: "CaptureTest",
  watchTest: "WatchTest",
  commandTest: "CommandTest",
  watchLiveTest: "WatchLiveTest",
  stream: "Stream",
  navi: "Navi",
  demoGpu: "GPU",
  demoAudio: "Audio",
  demoAi: "AI",
  demoSave: "Save",
} as const;

export type LogScopeKey = keyof typeof LOG_SCOPE;
