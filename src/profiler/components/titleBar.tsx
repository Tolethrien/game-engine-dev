import Graph from "../blocks/graph";
import { useRefreshRate } from "../hooks/useRefreshRate";
import { HISTORY_SAMPLES, auroraData, performanceData } from "../data";

function Metric(props: { label: string; value: string }) {
  return (
    <div class="flex items-baseline gap-1">
      <span class="text-caption uppercase tracking-[0.1em] text-fg-dim">
        {props.label}
      </span>
      <span class="min-w-[5ch] text-body tabular-nums">{props.value}</span>
    </div>
  );
}

export default function TitleBar() {
  const refreshRate = useRefreshRate();
  const latestPerformance = performanceData.latest;
  const latestAurora = auroraData.latest;
  const live = performanceData.live;

  return (
    <header
      class="flex h-titlebar shrink-0 select-none items-center gap-4 bg-titlebar pl-3 [-webkit-app-region:drag]"
      style={{ width: "env(titlebar-area-width, 100%)" }}
    >
      <span class="text-body font-bold uppercase tracking-[0.12em] text-fg">
        Misa Profiler
      </span>
      <div
        class="flex items-center gap-4 transition-opacity duration-150"
        classList={{ "opacity-40": !live() }}
      >
        <Graph
          width={72}
          height={20}
          frame
          capacity={HISTORY_SAMPLES}
          min={0}
          max={refreshRate() * 1.2}
          series={[
            {
              values: performanceData.history().map((snapshot) => snapshot.fps),
              color: "var(--color-live)",
              fill: true,
            },
          ]}
        />
        <Metric
          label="FPS"
          value={latestPerformance()?.fps.toFixed(0) ?? "—"}
        />
        <Metric
          label="1% low"
          value={latestPerformance()?.onePercentLow.toFixed(0) ?? "—"}
        />
        <Metric
          label="CPU"
          value={
            latestPerformance()
              ? `${latestPerformance()!.cpuTimeMs.toFixed(2)} ms`
              : "—"
          }
        />
        <Metric
          label="GPU"
          value={
            latestAurora() ? `${latestAurora()!.gpu.time.toFixed(2)} ms` : "—"
          }
        />
      </div>
    </header>
  );
}
