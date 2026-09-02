import { For, Show, createEffect, createSignal } from "solid-js";
import { useLocalStorage } from "../hooks/useLocalStorage";

export type ConsoleLevel = "log" | "warn" | "error" | "command" | "result";

export interface ConsoleLine {
  id: number;
  time: string;
  level: ConsoleLevel;
  text: string;
}

const LEVEL_CLASS: Record<ConsoleLevel, string> = {
  log: "text-fg",
  warn: "text-warn",
  error: "text-error",
  command: "text-live",
  result: "text-fg-dim",
};

export default function Console(props: {
  lines: ConsoleLine[];
  onCommand: (text: string) => void;
}) {
  let viewport: HTMLDivElement | undefined;
  const [expanded, setExpanded] = useLocalStorage("console.expanded", true);
  const [draft, setDraft] = createSignal("");
  const [stuckToBottom, setStuckToBottom] = createSignal(true);

  createEffect(() => {
    props.lines.length;
    if (!expanded() || !stuckToBottom() || !viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  });

  const onScroll = () => {
    if (!viewport) return;
    const distance =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setStuckToBottom(distance < 8);
  };

  const submit = (event: Event) => {
    event.preventDefault();
    const text = draft().trim();
    if (!text) return;
    props.onCommand(text);
    setDraft("");
  };

  return (
    <section class="flex shrink-0 flex-col overflow-hidden rounded-panel border border-outline bg-panel-body">
      <div class="flex h-panel-head shrink-0 items-center gap-gutter bg-panel-head px-2">
        <button
          class="flex h-full cursor-pointer select-none items-center gap-[9px] rounded-control px-1 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-live"
          onClick={() => setExpanded(!expanded())}
          aria-expanded={expanded()}
        >
          <span
            class="h-0 w-0 border-y-4 border-l-[5px] border-y-transparent border-l-fg-dim transition-transform duration-100"
            classList={{ "rotate-90": expanded() }}
          />
          <span class="text-body font-semibold text-fg">Console</span>
        </button>
      </div>

      <Show when={expanded()}>
        <div
          ref={viewport}
          onScroll={onScroll}
          class="scroll-area h-[150px] shrink-0 overflow-y-auto px-2 py-1 text-body leading-[1.45]"
        >
          <For each={props.lines}>
            {(line) => (
              <div class="flex gap-2">
                <span class="shrink-0 tabular-nums text-fg-dim">
                  {line.time}
                </span>
                <span class={`min-w-0 break-words ${LEVEL_CLASS[line.level]}`}>
                  {line.text}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <form
        onSubmit={submit}
        class="flex shrink-0 items-center gap-2 border-t border-outline px-2 py-1"
      >
        <span class="select-none text-live">&gt;</span>
        <input
          class="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-dim"
          placeholder="type a command..."
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          spellcheck={false}
          autocomplete="off"
        />
      </form>
    </section>
  );
}
// placeholder until the logger module starts reporting
export const MOCK_LINES: ConsoleLine[] = [
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
