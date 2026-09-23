import { Index } from "solid-js";
import AxiomMath from "@/core/axiom/math";

export interface BarItem {
  label: string;
  value: number;
  text?: string;
}

export default function Bars(props: {
  items: BarItem[];
  max?: number;
  color?: string;
}) {
  const max = () =>
    props.max ?? (Math.max(0, ...props.items.map((item) => item.value)) || 1);
  const percent = (value: number) => AxiomMath.clamp(value / max(), 0, 1) * 100;

  return (
    <div class="grid grid-cols-[minmax(0,max-content)_1fr_auto] items-center gap-x-2 gap-y-1">
      <Index each={props.items}>
        {(item) => (
          <>
            <span class="truncate text-fg-dim">{item().label}</span>
            <div class="h-2 overflow-hidden rounded-sm bg-divider">
              <div
                class="h-full rounded-sm"
                style={{
                  width: `${percent(item().value)}%`,
                  background: props.color ?? "var(--color-live)",
                }}
              />
            </div>
            <span class="text-right tabular-nums">
              {item().text ?? item().value.toLocaleString()}
            </span>
          </>
        )}
      </Index>
    </div>
  );
}
