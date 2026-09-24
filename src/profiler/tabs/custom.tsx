import { For, Show, createSignal } from "solid-js";
import Grid from "../grid/grid";
import {
  activeBoard,
  addBoard,
  boardPanels,
  boardTabId,
  boards,
  removeBoard,
  renameBoard,
  setActiveBoard,
  type CustomBoard,
} from "../pins";

const BOARD_BAR = {
  tab: "flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-body text-fg-dim hover:bg-divider hover:text-fg data-[active]:bg-divider data-[active]:text-fg",
  icon: "cursor-pointer rounded px-1 text-fg-dim hover:bg-divider hover:text-fg",
};

function BoardTab(props: { board: CustomBoard }) {
  const [editing, setEditing] = createSignal(false);
  const active = () => activeBoard().id === props.board.id;

  function commit(input: HTMLInputElement) {
    renameBoard(props.board.id, input.value);
    setEditing(false);
  }

  function remove(event: MouseEvent) {
    event.stopPropagation();
    const count = props.board.panels.length;
    if (count > 0 && !confirm(`Remove "${props.board.name}" with ${count} pinned panels?`))
      return;
    removeBoard(props.board.id);
  }

  return (
    <div
      class={BOARD_BAR.tab}
      data-active={active() ? "" : undefined}
      title="double-click to rename"
      onClick={() => setActiveBoard(props.board.id)}
      onDblClick={() => setEditing(true)}
    >
      <Show when={editing()} fallback={<span>{props.board.name}</span>}>
        <input
          ref={(input) => queueMicrotask(() => input.select())}
          class="w-24 bg-transparent text-fg outline-none"
          value={props.board.name}
          onBlur={(event) => commit(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget);
            if (event.key === "Escape") setEditing(false);
          }}
        />
      </Show>
      <Show when={boards().length > 1 && !editing()}>
        <button
          type="button"
          class="cursor-pointer leading-none text-fg-dim hover:text-error"
          aria-label={`Remove ${props.board.name}`}
          onClick={remove}
        >
          ×
        </button>
      </Show>
    </div>
  );
}

export default function CustomTab() {
  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-divider px-2 py-1">
        <For each={boards()}>{(board) => <BoardTab board={board} />}</For>
        <button
          type="button"
          class={BOARD_BAR.icon}
          aria-label="New board"
          title="new board"
          onClick={() => setActiveBoard(addBoard().id)}
        >
          +
        </button>
      </div>
      <div class="min-h-0 flex-1">
        <Grid
          tabId={boardTabId(activeBoard().id)}
          panels={boardPanels(activeBoard())}
          empty="pin a panel from another tab (pin icon in its header)"
        />
      </div>
    </div>
  );
}
