import { For, Show, createEffect, on } from "solid-js";
import { activeTab, setActiveTab } from "../tabs";
import { headRow } from "./flatten";
import ConsoleRowView from "./row";
import {
  CONSOLE,
  commandError,
  draft,
  getEntries,
  insertRequest,
  setCommandError,
  setDraft,
  submitDraft,
} from "./store";
import Suggestions from "./command/suggestions";
import { completion } from "./command/completion";
import { commandHistory } from "./command/history";

const PREVIEW_LINES = 2;
// keys that move the cursor without input: the replaced range has to follow
const CARET_KEYS = ["ArrowLeft", "ArrowRight", "Home", "End"];

export default function BottomConsole() {
  let input: HTMLInputElement | undefined;
  const onConsoleTab = () => activeTab() === "console";
  const cursor = () => input!.selectionStart ?? input!.value.length;

  const setText = (text: string, position = text.length) => {
    setDraft(text);
    input!.value = text;
    input!.setSelectionRange(position, position);
  };

  const pick = (index: number) => {
    const result = completion.accept(draft(), index);
    if (!result) return;
    setText(result.text, result.cursor);
    if (result.reopen) completion.refresh(result.text, result.cursor, true);
  };

  // the input loses its selection with focus, so it is remembered on blur
  let selection: { start: number; end: number } | null = null;

  const insertText = (text: string) => {
    const value = input!.value;
    const live = document.activeElement === input;
    const start = live ? (input!.selectionStart ?? value.length) : (selection?.start ?? value.length);
    const end = live ? (input!.selectionEnd ?? value.length) : (selection?.end ?? value.length);
    setText(value.slice(0, start) + text + value.slice(end), start + text.length);
    input!.focus();
    setCommandError("");
    completion.close();
  };

  createEffect(
    on(insertRequest, (request) => {
      if (request && input) insertText(request.text);
    }),
  );

  const showHistory =(text: string | null) => {
    if (text === null) return;
    setText(text);
    completion.close();
  };

  const submit = (event: Event) => {
    event.preventDefault();
    submitDraft();
  };

  const onInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
    const text = event.currentTarget.value;
    setDraft(text);
    setCommandError("");
    commandHistory.reset();
    completion.refresh(text, cursor(), false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const text = input!.value;
    if (event.ctrlKey && event.code === "Space") {
      event.preventDefault();
      completion.refresh(text, cursor(), true);
      return;
    }
    if (event.key === "Escape") {
      if (completion.state().open) event.preventDefault();
      completion.close();
      return;
    }
    if (completion.hasList()) {
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          completion.move(-1);
          return;
        case "ArrowDown":
          event.preventDefault();
          completion.move(1);
          return;
        case "Tab":
        case "Enter":
          event.preventDefault();
          pick(completion.state().selected);
          return;
      }
      return;
    }
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        showHistory(commandHistory.previous(text));
        return;
      case "ArrowDown":
        event.preventDefault();
        showHistory(commandHistory.next());
        return;
      case "Tab":
        event.preventDefault();
        completion.refresh(text, cursor(), true);
        return;
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (CARET_KEYS.includes(event.key) && completion.state().open)
      completion.refresh(input!.value, cursor(), false);
  };

  return (
    <section class="flex shrink-0 flex-col border-t border-outline bg-titlebar">
      <Show when={!onConsoleTab()}>
        <div class="py-1">
          <For each={getEntries().slice(-PREVIEW_LINES)}>
            {(entry) => (
              <div style={{ height: `${CONSOLE.rowHeight}px` }}>
                <ConsoleRowView row={headRow(entry)} query="" />
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="relative">
        <Suggestions onPick={pick} />
        <form
          onSubmit={submit}
          class="flex shrink-0 items-center gap-2 border-t border-outline px-3 py-1"
        >
          <span class="select-none text-live">&gt;</span>
          <input
            ref={input}
            class="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-dim"
            placeholder="type a command..."
            value={draft()}
            onInput={onInput}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onBlur={() => {
              selection = { start: cursor(), end: input!.selectionEnd ?? cursor() };
              completion.close();
            }}
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
      </div>
      <Show when={commandError()}>
        <pre class="whitespace-pre-wrap px-3 pb-1 text-body text-error">
          {commandError()}
        </pre>
      </Show>
    </section>
  );
}
