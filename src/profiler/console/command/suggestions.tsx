import { For, Show, createEffect } from "solid-js";
import Highlight from "../../blocks/highlight";
import LockIcon from "../../blocks/lockIcon";
import { completion, type SuggestionKind } from "./completion";

const SUGGESTIONS = {
  maxRows: 10,
  rowHeight: 20,
};

const KIND_STYLE: Record<SuggestionKind, { letter: string; bar: string }> = {
  root: { letter: "R", bar: "bg-live" },
  watch: { letter: "W", bar: "bg-notify" },
  variable: { letter: "V", bar: "bg-warn" },
  action: { letter: "A", bar: "bg-success" },
  field: { letter: "F", bar: "bg-fg-dim" },
  getter: { letter: "G", bar: "bg-fg-dim" },
  method: { letter: "M", bar: "bg-notify" },
  option: { letter: "O", bar: "bg-warn" },
  index: { letter: "#", bar: "bg-fg-dim" },
};

export default function Suggestions(props: { onPick: (index: number) => void }) {
  const rows: HTMLDivElement[] = [];

  createEffect(() => {
    const selected = completion.state().selected;
    rows[selected]?.scrollIntoView({ block: "nearest" });
  });

  return (
    <Show when={completion.state().open}>
      <div
        class="absolute bottom-full left-0 right-0 overflow-y-auto border border-b-0 border-outline bg-panel text-body shadow-lg"
        style={{ "max-height": `${SUGGESTIONS.maxRows * SUGGESTIONS.rowHeight}px` }}
        // keeps focus in the input, a blur would close the list before the click lands
        onMouseDown={(event) => event.preventDefault()}
      >
        <Show when={completion.state().signature}>
          {(signature) => (
            <div
              class="flex items-center px-2 italic text-fg-dim"
              style={{ height: `${SUGGESTIONS.rowHeight}px` }}
            >
              {signature()}
            </div>
          )}
        </Show>
        <For each={completion.state().items}>
          {(item, index) => (
            <div
              ref={(element) => (rows[index()] = element)}
              class="flex cursor-pointer items-center gap-2 whitespace-nowrap px-2 hover:bg-titlebar data-[selected]:bg-divider"
              data-selected={completion.state().selected === index() ? "" : undefined}
              style={{ height: `${SUGGESTIONS.rowHeight}px` }}
              onClick={() => props.onPick(index())}
            >
              <span
                class={`w-4 shrink-0 text-center text-window ${KIND_STYLE[item.kind].bar}`}
              >
                {KIND_STYLE[item.kind].letter}
              </span>
              <span class="shrink-0 text-fg">
                <Highlight text={item.label} query={completion.state().query} />
              </span>
              <Show when={item.locked}>
                <span class="shrink-0 text-warn" title="locked">
                  <LockIcon closed />
                </span>
              </Show>
              <span class="min-w-0 truncate text-fg-dim">{item.detail}</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
