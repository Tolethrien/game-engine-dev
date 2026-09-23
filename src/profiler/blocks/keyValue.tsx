import { For } from "solid-js";

export default function KeyValue(props: {
  items: { key: string; value: string }[];
}) {
  return (
    <div class="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
      <For each={props.items}>
        {(item) => (
          <>
            <span class="truncate text-fg-dim">{item.key}</span>
            <span class="truncate text-right tabular-nums">{item.value}</span>
          </>
        )}
      </For>
    </div>
  );
}
