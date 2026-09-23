import { For, Show, createMemo, createSignal } from "solid-js";
import AxiomMath from "@/core/axiom/math";

export interface TimelineBar {
  start: number;
  duration: number;
  label: string;
  color: string;
  title: string;
}

export interface TimelineLane {
  label: string;
  bars: TimelineBar[];
}

interface View {
  from: number;
  to: number;
}

const TIMELINE = {
  labelWidth: 96,
  laneHeight: 18,
  targetTicks: 5,
  zoomFactor: 0.8,
  minViewMs: 0.005,
};

function tickStep(range: number) {
  const raw = range / TIMELINE.targetTicks;
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const multiplier of [1, 2, 5]) {
    if (multiplier * power >= raw) return multiplier * power;
  }
  return 10 * power;
}

export default function Timeline(props: {
  lanes: TimelineLane[];
  span: number;
  empty?: string;
}) {
  // null = whole frame; kept across frames so the same fragment can be compared
  const [zoom, setZoom] = createSignal<View | null>(null);
  let axis!: HTMLDivElement;

  const view = createMemo<View>(() => {
    const current = zoom();
    if (!current) return { from: 0, to: props.span };
    const width = Math.min(current.to - current.from, props.span);
    const from = AxiomMath.clamp(current.from, 0, props.span - width);
    return { from, to: from + width };
  });
  const viewWidth = () => Math.max(view().to - view().from, Number.EPSILON);

  const ticks = createMemo(() => {
    const { from, to } = view();
    if (to <= from) return [];
    const step = tickStep(to - from);
    const digits = Math.max(0, -Math.floor(Math.log10(step)));
    const result: { position: number; label: string }[] = [];
    for (let value = Math.ceil(from / step) * step; value <= to; value += step) {
      result.push({
        position: ((value - from) / (to - from)) * 100,
        label: value.toFixed(digits),
      });
    }
    return result;
  });

  const setView = (from: number, width: number) => {
    if (width >= props.span) return setZoom(null);
    const clamped = AxiomMath.clamp(from, 0, props.span - width);
    setZoom({ from: clamped, to: clamped + width });
  };

  const onWheel = (event: WheelEvent) => {
    if (props.span <= 0) return;
    event.preventDefault();
    const rect = axis.getBoundingClientRect();
    const fraction = AxiomMath.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const { from } = view();
    const cursor = from + fraction * viewWidth();
    const factor = event.deltaY < 0 ? TIMELINE.zoomFactor : 1 / TIMELINE.zoomFactor;
    const width = Math.max(viewWidth() * factor, TIMELINE.minViewMs);
    setView(cursor - fraction * width, width);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || zoom() === null) return;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const start = view();
    const width = viewWidth();
    const pixels = axis.getBoundingClientRect().width;

    const move = (moveEvent: PointerEvent) => {
      setView(start.from - ((moveEvent.clientX - startX) / pixels) * width, width);
    };
    const stop = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  };

  const barStyle = (bar: TimelineBar) => ({
    left: `${((bar.start - view().from) / viewWidth()) * 100}%`,
    width: `${(bar.duration / viewWidth()) * 100}%`,
    "background-color": bar.color,
  });
  const visible = (bar: TimelineBar) =>
    bar.start + bar.duration >= view().from && bar.start <= view().to;

  return (
    <Show
      when={props.lanes.length > 0}
      fallback={<div class="px-1.5 py-1 italic text-fg-dim">{props.empty ?? "empty"}</div>}
    >
      <div
        class="h-full min-h-0 select-none overflow-y-auto"
        classList={{ "cursor-grab": zoom() !== null }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onDblClick={() => setZoom(null)}
      >
        <div class="sticky top-0 z-[1] flex border-b border-outline bg-panel">
          <div
            class="shrink-0 px-1.5 text-caption uppercase tracking-[0.1em] text-fg-dim"
            style={{ width: `${TIMELINE.labelWidth}px` }}
          >
            ms
          </div>
          <div ref={axis} class="relative h-4 min-w-0 flex-1 overflow-hidden">
            <For each={ticks()}>
              {(tick) => (
                <span
                  class="absolute top-0 -translate-x-1/2 text-caption text-fg-dim tabular-nums"
                  style={{ left: `${tick.position}%` }}
                >
                  {tick.label}
                </span>
              )}
            </For>
          </div>
        </div>

        <For each={props.lanes}>
          {(lane) => (
            <div
              class="flex border-b border-divider"
              style={{ height: `${TIMELINE.laneHeight}px` }}
            >
              <div
                class="shrink-0 truncate px-1.5 text-caption leading-[18px] text-fg-dim"
                style={{ width: `${TIMELINE.labelWidth}px` }}
                title={lane.label}
              >
                {lane.label}
              </div>
              <div class="relative min-w-0 flex-1 overflow-hidden">
                <For each={ticks()}>
                  {(tick) => (
                    <div
                      class="absolute inset-y-0 w-px bg-divider"
                      style={{ left: `${tick.position}%` }}
                    />
                  )}
                </For>
                <For each={lane.bars.filter(visible)}>
                  {(bar) => (
                    // min-width keeps a 0.005 ms step visible and hoverable
                    <div
                      class="absolute inset-y-0.5 min-w-px truncate border-r border-panel px-0.5 text-caption leading-[14px] text-window"
                      style={barStyle(bar)}
                      title={bar.title}
                    >
                      {bar.label}
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
