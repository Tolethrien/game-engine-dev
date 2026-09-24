import { createSignal } from "solid-js";
import type { PerformanceSnapshot } from "@/core/debugger/report";

export const HISTORY_SAMPLES = 60;

function createHistory<Snapshot>(
  subscribe: (callback: (data: Snapshot) => void) => () => void,
) {
  const [history, setHistory] = createSignal<Snapshot[]>([]);

  subscribe((data) =>
    setHistory((previous) => [
      ...previous.slice(-(HISTORY_SAMPLES - 1)),
      data,
    ]),
  );
  window.API.DEBUG.onGameReloaded(() => setHistory([]));

  return {
    history,
    latest: () => history().at(-1),
    live: () => history().length > 0,
  };
}

export const performanceData = createHistory<PerformanceSnapshot>(
  window.API.DEBUG.onPerformanceSnapshot,
);
