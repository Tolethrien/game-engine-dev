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
export const SHOW_THEME_PICKER = false;
