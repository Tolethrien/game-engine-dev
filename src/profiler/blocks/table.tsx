import { For, Show } from "solid-js";

export interface TableColumn {
  label: string;
  width?: string;
  align?: "right";
}

export default function Table(props: {
  columns: TableColumn[];
  rows: string[][];
  empty?: string;
}) {
  const template = () =>
    props.columns.map((column) => column.width ?? "minmax(0,1fr)").join(" ");
  const alignedRight = (index: number) =>
    props.columns[index]?.align === "right";

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

      <For each={props.rows}>
        {(row) => (
          <For each={row}>
            {(cell, index) => (
              <div
                class="truncate border-b border-divider px-1.5 py-0.5"
                classList={{ "text-right tabular-nums": alignedRight(index()) }}
                title={cell}
              >
                {cell}
              </div>
            )}
          </For>
        )}
      </For>

      <Show when={props.rows.length === 0}>
        <div class="col-span-full px-1.5 py-1 italic text-fg-dim">
          {props.empty ?? "empty"}
        </div>
      </Show>
    </div>
  );
}
