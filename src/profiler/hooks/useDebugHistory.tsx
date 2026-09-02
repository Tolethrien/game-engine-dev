import { createSignal, onCleanup } from "solid-js";

export function useDebugHistory<Snapshot>(
  subscribe: (callback: (data: Snapshot) => void) => () => void,
  limit = 60,
) {
  const [history, setHistory] = createSignal<Snapshot[]>([]);

  onCleanup(
    subscribe((data) =>
      setHistory((previous) => [...previous.slice(-(limit - 1)), data]),
    ),
  );
  onCleanup(window.API.DEBUG.onGameReloaded(() => setHistory([])));

  return history;
}
