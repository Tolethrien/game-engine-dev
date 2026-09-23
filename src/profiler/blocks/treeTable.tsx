import { For, Index, Show, createMemo } from "solid-js";
import { useLocalStorage } from "../hooks/useLocalStorage";
import type { TableColumn } from "./table";

export interface TreeRow {
  id: string;
  depth: number;
  cells: string[];
  hasChildren: boolean;
}

const INDENT_PX = 12;

export default function TreeTable(props: {
  columns: TableColumn[];
  rows: TreeRow[];
  storageKey: string;
  empty?: string;
}) {
  // stores expanded ids, so every node starts collapsed
  const [expanded, setExpanded] = useLocalStorage<string[]>(
    `treeExpanded:${props.storageKey}`,
    [],
  );
  const template = () =>
    props.columns.map((column) => column.width ?? "minmax(0,1fr)").join(" ");
  const alignedRight = (index: number) =>
    props.columns[index]?.align === "right";

  const visibleRows = createMemo(() => {
    const expandedIds = new Set(expanded());
    const visible: TreeRow[] = [];
    let hiddenBelow = Infinity;
    for (const row of props.rows) {
      if (row.depth > hiddenBelow) continue;
      hiddenBelow = Infinity;
      visible.push(row);
      if (!expandedIds.has(row.id)) hiddenBelow = row.depth;
    }
    return visible;
  });
  const visibleIds = createMemo(() => visibleRows().map((row) => row.id));
  const rowsById = createMemo(
    () => new Map(props.rows.map((row) => [row.id, row])),
  );

  const toggle = (id: string) =>
    setExpanded((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
    );

  return (
    <div class="grid" style={{ "grid-template-columns": template() }}>
      <For each={props.columns}>
        {(column) => (
          <div
            class="sticky top-0 z-[1] truncate border-b border-outline bg-panel px-1.5 py-1 text-caption uppercase tracking-[0.1em] text-fg-dim"
            classList={{ "text-right": column.align === "right" }}
          >
            {column.label}
          </div>
        )}
      </For>

      {/* keyed by id: rows are new objects on every update, keying by object would rebuild the DOM and drop clicks */}
      <For each={visibleIds()}>
        {(id) => {
          // an id leaving the list can still read the new map once before its item is disposed
          const row = () => rowsById().get(id);
          return (
            <Index each={row()?.cells ?? []}>
              {(cell, index) => (
                <Show
                  when={index === 0}
                  fallback={
                    <div
                      class="truncate border-b border-divider px-1.5 py-0.5"
                      classList={{
                        "text-right tabular-nums": alignedRight(index),
                      }}
                      title={cell()}
                    >
                      {cell()}
                    </div>
                  }
                >
                  <div
                    class="flex items-center truncate border-b border-divider px-1.5 py-0.5"
                    style={{
                      "padding-left": `${(row()?.depth ?? 0) * INDENT_PX + 6}px`,
                    }}
                  >
                    <Show
                      when={row()?.hasChildren}
                      fallback={<span class="inline-block w-3 shrink-0" />}
                    >
                      <button
                        class="inline-block w-3 shrink-0 cursor-pointer text-fg-dim outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-live"
                        onClick={() => toggle(id)}
                      >
                        {expanded().includes(id) ? "▾" : "▸"}
                      </button>
                    </Show>
                    <span class="truncate" title={cell()}>
                      {cell()}
                    </span>
                  </div>
                </Show>
              )}
            </Index>
          );
        }}
      </For>

      <Show when={props.rows.length === 0}>
        <div class="col-span-full px-1.5 py-1 italic text-fg-dim">
          {props.empty ?? "empty"}
        </div>
      </Show>
    </div>
  );
}
