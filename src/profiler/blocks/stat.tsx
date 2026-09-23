import { Show } from "solid-js";

export interface StatProps {
  label: string;
  value: string;
  unit?: string;
  big?: boolean;
}

export default function Stat(props: StatProps) {
  return (
    <Show
      when={props.big}
      fallback={
        <div class="flex min-w-0 flex-col">
          <span class="truncate text-caption uppercase tracking-[0.1em] text-fg-dim">
            {props.label}
          </span>
          <span class="truncate text-value font-semibold tabular-nums">
            {props.value}
            <Show when={props.unit}>
              <span class="ml-1 text-body font-normal text-fg-dim">
                {props.unit}
              </span>
            </Show>
          </span>
        </div>
      }
    >
      {/* size containment so cq units follow this block, not the viewport */}
      <div class="h-full w-full [container-type:size]">
        <div class="flex h-full flex-col justify-center overflow-hidden">
          <span class="truncate text-caption uppercase tracking-[0.1em] text-fg-dim">
            {props.label}
          </span>
          <span
            class="whitespace-nowrap font-semibold leading-none tabular-nums"
            style={{ "font-size": "min(55cqh, 18cqw)" }}
          >
            {props.value}
            <Show when={props.unit}>
              <span class="ml-[0.15em] text-[0.4em] font-normal text-fg-dim">
                {props.unit}
              </span>
            </Show>
          </span>
        </div>
      </div>
    </Show>
  );
}
