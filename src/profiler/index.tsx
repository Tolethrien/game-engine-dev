import { render } from "solid-js/web";
import PerformancePanel from "./components/performance";
import { createSignal, Show } from "solid-js";

function App() {
  const [connected, setConnected] = createSignal(true);
  window.API.DEBUG.onGameReloaded(() => setConnected(false));
  window.API.DEBUG.onPerformanceSnapshot(() => setConnected(true));
  return (
    <Show when={connected()} fallback={<WaitingForGame />}>
      <p>Profiler</p>
      <PerformancePanel />
    </Show>
  );
}
function WaitingForGame() {
  return (
    <div
      style={{ padding: "24px", color: "#7f849c", "font-family": "monospace" }}
    >
      waiting for game...
    </div>
  );
}
render(() => <App />, document.getElementById("app")!);
