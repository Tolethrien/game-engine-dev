import { createEffect } from "solid-js";
import { useLocalStorage } from "./useLocalStorage";
import { DEFAULT_THEME, THEMES, type Theme } from "../themes";

export function useTheme() {
  const [storedTheme, setStoredTheme] = useLocalStorage<Theme>(
    "theme",
    DEFAULT_THEME,
  );

  // localStorage may hold an id from a build that had other themes
  const theme = () => (storedTheme() in THEMES ? storedTheme() : DEFAULT_THEME);

  // the default theme is what @theme emits, so it needs no attribute
  createEffect(() => {
    const current = theme();
    if (current === DEFAULT_THEME) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = current;
  });

  return [theme, setStoredTheme] as const;
}
