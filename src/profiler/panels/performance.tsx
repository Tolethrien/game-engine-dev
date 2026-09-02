import { For } from "solid-js";
import CollapsiblePanel, {
  Section,
  Slot,
  SlotGroup,
} from "../components/panel";
import Sparkline from "../components/sparkline";
import Stat from "../components/stat";
import { useDebugHistory } from "../hooks/useDebugHistory";
import { useRefreshRate } from "../hooks/useRefreshRate";
import { Table, TableCell, TableRow } from "../components/table";

const HISTORY_SAMPLES = 60;
const SEPARATION_RATIO = 0.12;

export default function PerformancePanel() {
  const refreshRate = useRefreshRate();
  const CPUPerformance = useDebugHistory(
    window.API.DEBUG.onPerformanceSnapshot,
    HISTORY_SAMPLES,
  );
  const CPUlatest = () => CPUPerformance().at(-1);
  const GPUPerformance = useDebugHistory(window.API.DEBUG.onAuroraSnapshot);
  const GPULatest = () => GPUPerformance().at(-1);
  const onePercentLowValues = () => {
    const threshold = refreshRate() * SEPARATION_RATIO;
    const samples = CPUPerformance();

    const diverges = (snapshot?: PerformanceSnapshot) =>
      snapshot !== undefined &&
      snapshot.fps - snapshot.onePercentLow >= threshold;

    return samples.map((snapshot, index) => {
      if (diverges(snapshot)) return snapshot.onePercentLow;

      const touchesVisible =
        diverges(samples[index - 1]) || diverges(samples[index + 1]);
      return touchesVisible ? snapshot.onePercentLow : null;
    });
  };

  return (
    <CollapsiblePanel
      id="performance"
      title="Performance"
      live={CPUPerformance().length > 0}
      defaultPinned={["graph", "fps", "onePercentLow"]}
    >
      <SlotGroup>
        <Slot id="graph">
          <Sparkline
            capacity={HISTORY_SAMPLES}
            min={0}
            max={refreshRate() * 1.2}
            series={[
              {
                values: CPUPerformance().map((snapshot) => snapshot.fps),
                color: "var(--color-live)",
                fill: true,
              },
              { values: onePercentLowValues(), color: "var(--color-stale)" },
            ]}
          />
        </Slot>
        <Slot id="fps">
          <Stat label="FPS" value={CPUlatest()?.fps.toFixed(0) ?? "—"} />
        </Slot>
        <Slot id="onePercentLow">
          <Stat
            label="1% Low"
            value={CPUlatest()?.onePercentLow.toFixed(0) ?? "—"}
          />
        </Slot>
      </SlotGroup>
      <SlotGroup>
        <Slot id="cpu">
          <Stat
            label="CPU Time"
            value={`${CPUlatest()?.cpuTimeMs.toFixed(2) ?? "—"} ms`}
          />
        </Slot>
        <Slot id="gpu">
          <Stat
            label="GPU Time"
            value={`${GPULatest()?.GPUTime.toFixed(2) ?? "—"} ms`}
          />
        </Slot>
      </SlotGroup>
      <Section>Pipeline times</Section>
      <Slot align="center">
        <Table columns="1fr auto">
          <TableRow head>
            <TableCell>Pipeline</TableCell>
            <TableCell align="right">Time</TableCell>
          </TableRow>

          <For each={GPULatest()?.pipelineTimes ?? []}>
            {(entry) => (
              <TableRow>
                <TableCell>{entry.name}</TableCell>
                <TableCell align="right">{entry.time} ms</TableCell>
              </TableRow>
            )}
          </For>
        </Table>
      </Slot>
    </CollapsiblePanel>
  );
}
