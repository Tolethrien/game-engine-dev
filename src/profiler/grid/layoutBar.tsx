import { For, Show, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { LayoutMode, LayoutSort } from "./layouts";
import type { TabLayout } from "./layoutState";

const MODE_LABELS: Record<LayoutMode, string> = {
  shelf: "Rows",
  skyline: "Dense",
  manual: "Manual",
};

const SORT_LABELS: Record<LayoutSort, string> = {
  definition: "default",
  size: "size",
  name: "name",
};

function Segmented<T extends string>(props: {
  label: string;
  labels: Record<T, string>;
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div
      class="flex items-center gap-2 transition-opacity duration-150"
      classList={{ "opacity-40": props.disabled }}
    >
      <span class="uppercase tracking-[0.1em] text-fg-dim">{props.label}</span>
      <div class="flex overflow-hidden rounded border border-divider">
        <For each={Object.keys(props.labels) as T[]}>
          {(value) => (
            <button
              class="cursor-pointer px-2 py-0.5 text-fg-dim not-disabled:hover:text-fg disabled:cursor-default data-[active]:bg-divider data-[active]:text-fg"
              data-active={props.value === value ? "" : undefined}
              aria-pressed={props.value === value}
              disabled={props.disabled}
              onClick={() => props.onChange(value)}
            >
              {props.labels[value]}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

export default function LayoutBar(props: {
  layout: TabLayout;
  onMode: (mode: LayoutMode) => void;
  onSort: (sort: LayoutSort) => void;
  onReset: () => void;
  actions?: Component;
}) {
  const manual = () => props.layout.mode === "manual";

  return (
    <div class="flex h-8 shrink-0 select-none items-center gap-4 border-b border-divider px-3 text-caption">
      <Segmented
        label="Layout"
        labels={MODE_LABELS}
        value={props.layout.mode}
        onChange={props.onMode}
      />
      <Segmented
        label="Sort"
        labels={SORT_LABELS}
        value={props.layout.sort}
        disabled={manual()}
        onChange={props.onSort}
      />
      <div class="ml-auto flex items-center gap-2">
        <Show when={props.actions}>{(actions) => <Dynamic component={actions()} />}</Show>
      </div>
      <button
        class="cursor-pointer rounded border border-divider px-2 py-0.5 text-fg-dim not-disabled:hover:text-fg disabled:cursor-default disabled:opacity-40"
        disabled={!manual()}
        onClick={() => props.onReset()}
      >
        ↺ reset
      </button>
    </div>
  );
}
