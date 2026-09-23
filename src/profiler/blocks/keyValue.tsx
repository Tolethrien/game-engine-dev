import { Index, Show } from "solid-js";

export interface KeyValueItem {
  key: string;
  value: string;
  // any CSS color, drawn as a swatch before the value
  color?: string;
}

export default function KeyValue(props: { items: KeyValueItem[] }) {
  return (
    <div class="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
      <Index each={props.items}>
        {(item) => (
          <>
            <span class="truncate text-fg-dim">{item().key}</span>
            <span class="flex min-w-0 items-center gap-1.5 tabular-nums">
              <Show when={item().color}>
                {(color) => (
                  <span
                    class="inline-block size-3 shrink-0 rounded-sm border border-outline"
                    style={{ background: color() }}
                  />
                )}
              </Show>
              <span class="truncate">{item().value}</span>
            </span>
          </>
        )}
      </Index>
    </div>
  );
}
