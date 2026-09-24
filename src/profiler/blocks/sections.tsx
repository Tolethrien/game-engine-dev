import { Index, Show } from "solid-js";
import type { KeyValueItem } from "./keyValue";
import Table, { type TableColumn } from "./table";

export interface Section {
  title: string;
  items?: KeyValueItem[];
  table?: { columns: TableColumn[]; rows: string[][] };
}

const OPTION_COLUMNS: TableColumn[] = [
  { label: "Option", width: "max-content" },
  { label: "Value" },
];

// Index keeps the DOM across state updates, so text stays selectable
export default function Sections(props: { sections: Section[] }) {
  return (
    <Index each={props.sections}>
      {(section, index) => (
        <>
          <div
            class="text-caption uppercase tracking-[0.1em] text-fg-dim"
            classList={{ "mt-2": index > 0 }}
          >
            {section().title}
          </div>
          <Show when={section().items}>
            {(items) => (
              <Table
                columns={OPTION_COLUMNS}
                rows={items().map((item) => [item.key, item.value])}
                cellColor={(row, column) =>
                  column === 1 ? items()[row]?.color : undefined
                }
              />
            )}
          </Show>
          <Show when={section().table}>
            {(table) => <Table columns={table().columns} rows={table().rows} />}
          </Show>
        </>
      )}
    </Index>
  );
}
