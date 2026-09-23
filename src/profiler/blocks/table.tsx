import { For, Index, Show } from "solid-js";

export interface TableColumn {
  label: string;
  width?: string;
  align?: "right";
}

export default function Table(props: {
  columns: TableColumn[];
  rows: string[][];
  empty?: string;
  // any CSS color drawn as a swatch before the cell text
  cellColor?: (row: number, column: number) => string | undefined;
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

      {/* Index keeps the DOM across updates (rows are new arrays each time), so a text selection survives */}
      <Index each={props.rows}>
        {(row, rowIndex) => (
          <Index each={row()}>
            {(cell, index) => (
              <div
                class="truncate border-b border-divider px-1.5 py-0.5"
                classList={{ "text-right tabular-nums": alignedRight(index) }}
                title={cell()}
              >
                <Show when={props.cellColor?.(rowIndex, index)}>
                  {(color) => (
                    <span
                      class="mr-1.5 inline-block size-3 rounded-sm border border-outline align-[-2px]"
                      style={{ background: color() }}
                    />
                  )}
                </Show>
                {cell()}
              </div>
            )}
          </Index>
        )}
      </Index>

      <Show when={props.rows.length === 0}>
        <div class="col-span-full px-1.5 py-1 italic text-fg-dim">
          {props.empty ?? "empty"}
        </div>
      </Show>
    </div>
  );
}
