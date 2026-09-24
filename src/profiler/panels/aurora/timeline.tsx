import { For, createMemo, createSignal } from "solid-js";
import Timeline, { type TimelineLane } from "../../blocks/timeline";
import Stat from "../../blocks/stat";
import { Block, Rows } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { METRIC_KEYS } from "@/core/debugger/modules/aurora/keys";
import type { GpuTimelineFrame } from "@/core/debugger/modules/aurora/report";
import { formatMs } from "../../format";

type TimelineMode = "last" | "peak";

const MODES: Record<TimelineMode, string> = { last: "last", peak: "peak 5 s" };

// step time relative to its 5 s median
const SLOW = {
  warn: 1.5,
  error: 3,
  colors: {
    normal: "var(--color-live)",
    warn: "var(--color-warn)",
    error: "var(--color-error)",
  },
};

// a leaf node sums every repeat of its label in a frame, one step is compared to sum / count
function typicalTime(label: string) {
  const sum = auroraStore.stats(METRIC_KEYS.nodeSum + label);
  if (!sum) return undefined;
  const count = auroraStore.stats(METRIC_KEYS.nodeCount + label)?.median ?? 1;
  return sum.median / Math.max(1, count);
}

function slowColor(time: number, typical?: number) {
  if (!typical) return SLOW.colors.normal;
  const ratio = time / typical;
  if (ratio > SLOW.error) return SLOW.colors.error;
  if (ratio > SLOW.warn) return SLOW.colors.warn;
  return SLOW.colors.normal;
}

function buildLanes(frame: GpuTimelineFrame): TimelineLane[] {
  const lanes = new Map<string, TimelineLane>();
  const typicals = new Map<string, number | undefined>();
  for (const step of frame.steps) {
    let lane = lanes.get(step.owner);
    if (!lane) lanes.set(step.owner, (lane = { label: step.owner, bars: [] }));
    if (!typicals.has(step.label)) typicals.set(step.label, typicalTime(step.label));
    const typical = typicals.get(step.label);
    const prefix = `${step.owner}:`;
    lane.bars.push({
      start: step.start,
      duration: step.time,
      label: step.label.startsWith(prefix) ? step.label.slice(prefix.length) : step.label,
      color: slowColor(step.time, typical),
      title: [
        step.label,
        `start ${formatMs(step.start, 3)} ms`,
        `time ${formatMs(step.time, 3)} ms`,
        `median ${formatMs(typical, 3)} ms`,
      ].join("\n"),
    });
  }
  return [...lanes.values()];
}

export default function AuroraTimelinePanel() {
  const [mode, setMode] = useLocalStorage<TimelineMode>("auroraTimelineMode", "last");
  const [frozen, setFrozen] = createSignal<GpuTimelineFrame | null>(null);

  const frame = createMemo(
    () =>
      frozen() ??
      (mode() === "last" ? auroraStore.timelineLast() : auroraStore.timelinePeak()),
  );
  const lanes = createMemo(() => {
    const current = frame();
    return current ? buildLanes(current) : [];
  });

  const toggleFreeze = () => setFrozen(frozen() ? null : frame());
  const buttonClass =
    "cursor-pointer px-2 py-0.5 text-fg-dim hover:text-fg data-[active]:bg-divider data-[active]:text-fg";

  return (
    <Rows>
      <Block size="fit">
        <div class="flex items-center gap-4 text-caption">
          <div class="flex overflow-hidden rounded border border-divider">
            <For each={Object.keys(MODES) as TimelineMode[]}>
              {(value) => (
                <button
                  class={buttonClass}
                  data-active={mode() === value && !frozen() ? "" : undefined}
                  onClick={() => {
                    setFrozen(null);
                    setMode(value);
                  }}
                >
                  {MODES[value]}
                </button>
              )}
            </For>
            <button
              class={buttonClass}
              data-active={frozen() ? "" : undefined}
              onClick={toggleFreeze}
            >
              {frozen() ? "frozen" : "freeze"}
            </button>
          </div>
          <div class="grid flex-1 grid-cols-4 gap-x-3">
            <Stat label="frame" value={String(frame()?.frame ?? "—")} />
            <Stat label="span ms" value={formatMs(frame()?.span, 3)} />
            <Stat label="busy ms" value={formatMs(frame()?.busy, 3)} />
            {/* gaps between steps: the GPU waiting, invisible in the timings tree */}
            <Stat
              label="idle ms"
              value={formatMs(
                frame() ? Math.max(0, frame()!.span - frame()!.busy) : undefined,
                3,
              )}
            />
          </div>
        </div>
      </Block>
      <Block size="fill">
        <Timeline lanes={lanes()} span={frame()?.span ?? 0} empty="no gpu data" />
      </Block>
    </Rows>
  );
}
