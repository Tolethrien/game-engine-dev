import { For, createEffect, createSignal } from "solid-js";
import { LEVEL_CLASS, lines } from "../console/store";

export default function ConsoleTab() {
  let viewport: HTMLDivElement | undefined;
  const [stuckToBottom, setStuckToBottom] = createSignal(true);

  createEffect(() => {
    lines();
    if (!stuckToBottom() || !viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  });

  const onScroll = () => {
    if (!viewport) return;
    const distance =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setStuckToBottom(distance < 8);
  };

  return (
    <div
      ref={viewport}
      onScroll={onScroll}
      class="h-full overflow-y-auto px-3 py-2 text-body leading-[1.45]"
    >
      <For each={lines()}>
        {(line) => (
          <div class="flex gap-2">
            <span class="shrink-0 tabular-nums text-fg-dim">{line.time}</span>
            <span class={`min-w-0 break-words ${LEVEL_CLASS[line.level]}`}>
              {line.text}
            </span>
          </div>
        )}
      </For>
    </div>
  );
}
