import type { ILogHandle } from "../../interfaces";
import type { DevLogger } from "./log";

export const CAPTURE = {
  // true: devtools still shows "Uncaught …" and mirrors every debug.log entry; false: profiler only
  mirrorToDevtools: true,
  scope: "Error",
  throttleMs: 1000,
  // errors skip the valve, so repeats are throttled per message instead
  maxHandles: 200,
};

export function captureErrors(logger: DevLogger) {
  const scope = logger.named(CAPTURE.scope);
  const handles = new Map<string, ILogHandle>();
  const handleFor = (key: string) => {
    let handle = handles.get(key);
    if (!handle) {
      if (handles.size >= CAPTURE.maxHandles) handles.clear();
      handle = scope.throttle(CAPTURE.throttleMs);
      handles.set(key, handle);
    }
    return handle;
  };

  window.addEventListener(
    "error",
    (event: Event) => {
      if (event instanceof ErrorEvent) {
        // main tries a raw console command as an expression first, a failed compile is reported by the command itself
        if (window.__debugCommand?.probing && isSyntaxError(event)) {
          event.preventDefault();
          return;
        }
        if (!CAPTURE.mirrorToDevtools) event.preventDefault();
        const handle = handleFor(`error|${event.message}`);
        if (event.error instanceof Error)
          handle.error(event.message, event.error);
        // throw "text" or a cross-origin "Script error." without an object
        else handle.error(event.error ?? event.message);
        return;
      }
      // resource load failures do not bubble, they only reach a capturing listener
      const target = event.target;
      if (!(target instanceof Element)) return;
      const tag = target.tagName.toLowerCase();
      const source =
        target.getAttribute("src") ?? target.getAttribute("href") ?? "";
      handleFor(`load|${tag}|${source}`).error(
        `failed to load <${tag}>`,
        source,
      );
    },
    { capture: true },
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (!CAPTURE.mirrorToDevtools) event.preventDefault();
    handleFor(`rejection|${reasonKey(event.reason)}`).error(
      "unhandled rejection",
      event.reason,
    );
  });
}

function reasonKey(reason: unknown) {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  try {
    return String(reason);
  } catch {
    return typeof reason;
  }
}

function isSyntaxError(event: ErrorEvent) {
  return (
    event.error instanceof SyntaxError ||
    event.message.startsWith("Uncaught SyntaxError")
  );
}
