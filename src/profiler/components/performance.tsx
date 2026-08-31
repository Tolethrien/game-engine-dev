import { createSignal, Show } from "solid-js";

const FPS_GOOD = 50;
const FPS_OK = 30;

function fpsColor(fps: number) {
  if (fps >= FPS_GOOD) return "#4ade80"; // green
  if (fps >= FPS_OK) return "#facc15"; // yellow
  return "#f87171"; // red
}

export default function PerformancePanel() {
  const [data, setData] = createSignal<PerformanceSnapshot>();

  window.API.DEBUG.onPerformanceSnapshot(setData);

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Performance</div>
      <Show
        when={data()}
        fallback={<div style={styles.waiting}>waiting for data...</div>}
      >
        {(snap) => (
          <div style={styles.row}>
            <Stat
              label="FPS"
              value={snap().fps.toFixed(0)}
              color={fpsColor(snap().fps)}
            />
            <Stat
              label="CPU"
              value={`${snap().cpuTimeMs.toFixed(2)} ms`}
              color="#e2e8f0"
            />
            <Stat
              label="1% Low"
              value={snap().onePercentLow.toFixed(0)}
              color={fpsColor(snap().onePercentLow)}
            />
          </div>
        )}
      </Show>
    </div>
  );
}

function Stat(props: { label: string; value: string; color: string }) {
  return (
    <div style={styles.stat}>
      <div style={styles.statLabel}>{props.label}</div>
      <div style={{ ...styles.statValue, color: props.color }}>
        {props.value}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    "font-family": "'Consolas', 'Menlo', monospace",
    background: "#1e1e2e",
    border: "1px solid #313244",
    "border-radius": "8px",
    padding: "12px 16px",
    color: "#cdd6f4",
    "min-width": "260px",
  },
  title: {
    "font-size": "12px",
    "text-transform": "uppercase",
    "letter-spacing": "0.05em",
    color: "#7f849c",
    "margin-bottom": "8px",
  },
  waiting: { color: "#6c7086", "font-size": "13px" },
  row: { display: "flex", gap: "20px" },
  stat: { display: "flex", "flex-direction": "column", gap: "2px" },
  statLabel: { "font-size": "11px", color: "#7f849c" },
  statValue: { "font-size": "20px", "font-weight": "600" },
} as const;
