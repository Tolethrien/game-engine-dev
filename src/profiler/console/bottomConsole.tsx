import { For, Show } from "solid-js";
import { activeTab, setActiveTab } from "../tabs";
import { LEVEL_CLASS, draft, lines, setDraft, submitDraft } from "./store";

const PREVIEW_LINES = 2;

export default function BottomConsole() {
  const onConsoleTab = () => activeTab() === "console";

  const submit = (event: Event) => {
    event.preventDefault();
    submitDraft();
  };

  return (
    <section class="flex shrink-0 flex-col border-t border-outline bg-titlebar">
      <Show when={!onConsoleTab()}>
        <div class="px-3 py-1 text-body leading-[1.45]">
          <For each={lines().slice(-PREVIEW_LINES)}>
            {(line) => (
              <div class="flex gap-2">
                <span class="shrink-0 tabular-nums text-fg-dim">
                  {line.time}
                </span>
                <span class={`min-w-0 truncate ${LEVEL_CLASS[line.level]}`}>
                  {line.text}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <form
        onSubmit={submit}
        class="flex shrink-0 items-center gap-2 border-t border-outline px-3 py-1"
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
        <Show when={!onConsoleTab()}>
          <button
            type="button"
            class="cursor-pointer px-1 text-fg-dim hover:text-fg"
            aria-label="Open console tab"
            onClick={() => setActiveTab("console")}
          >
            ↑
          </button>
        </Show>
      </form>
    </section>
  );
}
