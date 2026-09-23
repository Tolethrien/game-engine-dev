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

// placeholder until the logger module starts reporting; mock lines looked like real game errors
const PLACEHOLDER_LINES: ConsoleLine[] = [
  {
    id: 1,
    time: "",
    level: "result",
    text: "console is not connected to the game yet",
  },
];

export const [lines, setLines] = createSignal<ConsoleLine[]>(PLACEHOLDER_LINES);
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
