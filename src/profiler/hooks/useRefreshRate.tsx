import { createSignal, onCleanup } from "solid-js";

export function useRefreshRate() {
  const [refreshRate, setRefreshRate] = createSignal(60);

  const read = () => window.API.WINDOW.getRefreshRate().then(setRefreshRate);
  read();
  onCleanup(window.API.DEBUG.onGameReloaded(read));

  return refreshRate;
}
