import { Show, createMemo } from "solid-js";
import VirtualList from "../blocks/virtualList";
import { flattenRows } from "../console/flatten";
import ConsoleRowView from "../console/row";
import ConsoleToolbar from "../console/toolbar";
import {
  CONSOLE,
  expanded,
  filterEntries,
  getEntries,
  query,
  toast,
} from "../console/store";

export default function ConsoleTab() {
  const filtered = createMemo(() => filterEntries());
  const rows = createMemo(() => flattenRows(filtered(), expanded()));

  return (
    <div class="flex h-full flex-col">
      <ConsoleToolbar />
      <div class="min-h-0 flex-1">
        <VirtualList count={rows().length} rowHeight={CONSOLE.rowHeight}>
          {(index) => (
            <Show when={rows()[index]}>
              {(row) => <ConsoleRowView row={row()} query={query().trim()} />}
            </Show>
          )}
        </VirtualList>
      </div>
      <div class="flex justify-between border-t border-outline bg-titlebar px-2 text-caption text-fg-dim">
        <span class="tabular-nums">
          <Show when={filtered().length !== getEntries().length}>
            {filtered().length.toLocaleString()} shown ·{" "}
          </Show>
          {getEntries().length.toLocaleString()} /{" "}
          {CONSOLE.maxEntries.toLocaleString()}
        </span>
        <span>{toast()}</span>
      </div>
    </div>
  );
}
