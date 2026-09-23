import { createSignal } from "solid-js";

export type ConsoleLevel = "log" | "warn" | "error" | "command" | "result";

export interface ConsoleLine {
  id: number;
  time: string;
  level: ConsoleLevel;
  text: string;
}

export const LEVEL_CLASS: Record<ConsoleLevel, string> = {
  log: "text-fg",
  warn: "text-warn",
  error: "text-error",
  command: "text-live",
  result: "text-fg-dim",
};

// placeholder until the logger module starts reporting
const MOCK_LINES: ConsoleLine[] = [
  {
    id: 1,
    time: "12:04:31",
    level: "log",
    text: "Aurora device acquired: NVIDIA / ampere",
  },
  { id: 2, time: "12:04:31", level: "log", text: "Loaded 42 assets in 318 ms" },
  {
    id: 3,
    time: "12:04:32",
    level: "warn",
    text: "Texture 'ui_atlas' is not power of two",
  },
  {
    id: 4,
    time: "12:04:33",
    level: "command",
    text: "> scene.reload MainMenu",
  },
  { id: 5, time: "12:04:33", level: "result", text: "scene reloaded in 84 ms" },
  {
    id: 6,
    time: "12:04:41",
    level: "error",
    text: "WGSL compile failed: bloom.wgsl:37 unresolved identifier 'threshhold'",
  },
];

export const [lines, setLines] = createSignal<ConsoleLine[]>(MOCK_LINES);
export const [draft, setDraft] = createSignal("");

// placeholder: echoes the command until commands actually reach the game
export function run(text: string) {
  setLines((previous) => [
    ...previous,
    {
      id: previous.length + 1,
      time: new Date().toTimeString().slice(0, 8),
      level: "command",
      text: `> ${text}`,
    },
  ]);
}

export function submitDraft() {
  const text = draft().trim();
  if (!text) return;
  run(text);
  setDraft("");
}
