import { createEffect, createSignal } from "solid-js";

export function useLocalStorage<T>(key: string, initial: T) {
  const stored = localStorage.getItem(key);
  const value = stored ? (JSON.parse(stored) as T) : initial;
  const [signal, setSignal] = createSignal<T>(value);

  createEffect(() => {
    localStorage.setItem(key, JSON.stringify(signal()));
  });

  return [signal, setSignal] as const;
}
