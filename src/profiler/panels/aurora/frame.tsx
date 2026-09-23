import { createMemo } from "solid-js";
import Graph from "../../blocks/graph";
import Stat from "../../blocks/stat";
import { Block, Rows } from "../../grid/layout";
import { AURORA_HISTORY, auroraStore } from "../../aurora/store";
import { METRIC_KEYS } from "@/core/debugger/modules/aurora/keys";
import { formatMs } from "../../format";

export default function AuroraFramePanel() {
  const span = createMemo(() => auroraStore.stats(METRIC_KEYS.gpuSpan));
  const busy = createMemo(() => auroraStore.stats(METRIC_KEYS.gpuBusy));
  const history = createMemo(() =>
    auroraStore.values(METRIC_KEYS.gpuSpan, AURORA_HISTORY.graphReports),
  );
  // spikes are clipped at the top, otherwise one 20 ms frame flattens every normal one
  const scaleMax = createMemo(() => {
    const p95 = span()?.p95;
    return p95 === undefined ? undefined : Math.max(p95 * 2, 0.1);
  });
  const p95Line = createMemo(() => {
    const p95 = span()?.p95 ?? null;
    return history().map(() => p95);
  });

  return (
    <Rows>
      <Block size="fit">
        {/* fixed width grid: a content-sized auto-fit grid collapses to one column and spills onto the graph */}
        <div class="flex h-20 gap-3">
          <div class="min-w-0 flex-1">
            <Stat big label="GPU" value={formatMs(span()?.median, 3)} unit="ms" />
          </div>
          <div class="grid w-44 shrink-0 grid-cols-2 content-center gap-x-3 gap-y-1">
            <Stat label="busy ms" value={formatMs(busy()?.median, 3)} />
            <Stat label="p95 ms" value={formatMs(span()?.p95, 3)} />
            <Stat label="min ms" value={formatMs(span()?.min, 3)} />
            <Stat label="max ms" value={formatMs(span()?.max, 3)} />
          </div>
        </div>
      </Block>
      <Block size="fill" class="relative">
        <span class="pointer-events-none absolute right-1 top-0 z-[1] text-caption text-fg-dim tabular-nums">
          p95
        </span>
        <Graph
          min={0}
          max={scaleMax()}
          capacity={Math.max(2, history().length)}
          series={[
            { values: history(), color: "var(--color-live)", fill: true },
            { values: p95Line(), color: "var(--color-fg-dim)" },
          ]}
        />
      </Block>
    </Rows>
  );
}
