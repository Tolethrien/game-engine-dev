import { createEffect } from "solid-js";
import { useLocalStorage } from "./hooks/useLocalStorage";

export const THEMES = {
  mocha: "Mocha",
  ember: "Ember",
  paper: "Paper",
  steel: "Steel",
  prism: "Prism",
} as const;

export type Theme = keyof typeof THEMES;

export const THEME_IDS = Object.keys(THEMES) as Theme[];

export const DEFAULT_THEME: Theme = "mocha";

const [storedTheme, setTheme] = useLocalStorage<string>("theme", DEFAULT_THEME);

// localStorage may hold an id from a build that had other themes
export const activeTheme = (): Theme =>
  storedTheme() in THEMES ? (storedTheme() as Theme) : DEFAULT_THEME;

export { setTheme };

export function initTheme() {
  createEffect(() => {
    const current = activeTheme();
    const root = document.documentElement;
    // the default theme is what @theme emits, so it needs no attribute
    if (current === DEFAULT_THEME) delete root.dataset.theme;
    else root.dataset.theme = current;

    const styles = getComputedStyle(root);
    window.API.PROFILER.setTitleBarColors({
      color: styles.getPropertyValue("--color-titlebar").trim(),
      symbolColor: styles.getPropertyValue("--color-fg").trim(),
    });
  });
}
