import { For, Show, createSignal } from "solid-js";
import { render } from "solid-js/web";
import "@/css/profiler.css";
import PerformancePanel from "./panels/performance";
import { PANELS, PANEL_IDS, type PanelID } from "./panels/registry";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useTheme } from "./hooks/useTheme";
import { THEMES, THEME_IDS, SHOW_THEME_PICKER } from "./themes";
import DraggableList from "./components/dragList";
import Console, { MOCK_LINES, type ConsoleLine } from "./components/console";

function App() {
  const [theme, setTheme] = useTheme();
  const [lines, setLines] = createSignal<ConsoleLine[]>(MOCK_LINES);

  const [storedOrder, setStoredOrder] = useLocalStorage<PanelID[]>(
    "panelOrder",
    PANEL_IDS,
  );

  const order = () => {
    const known = storedOrder().filter((id) => id in PANELS);
    const added = PANEL_IDS.filter((id) => !known.includes(id));
    return [...known, ...added];
  };

  // placeholder: echoes the command until commands actually reach the game
  const runCommand = (text: string) =>
    setLines((previous) => [
      ...previous,
      {
        id: previous.length + 1,
        time: new Date().toTimeString().slice(0, 8),
        level: "command",
        text: `> ${text}`,
      },
    ]);

  return (
    <div class="flex h-full flex-col gap-1">
      <Show when={SHOW_THEME_PICKER}>
        <div class="flex shrink-0 items-center justify-end gap-gutter px-0.5 pb-0.5">
          <span class="cursor-default select-none text-caption uppercase tracking-[0.12em] text-fg-dim">
            Theme
          </span>
          <div class="flex overflow-hidden rounded-control border border-outline">
            <For each={THEME_IDS}>
              {(id) => (
                <button
                  class="cursor-pointer px-2 py-0.5 text-caption uppercase tracking-[0.1em] text-fg-dim transition-colors duration-150 hover:text-fg data-[active]:bg-panel-head data-[active]:text-fg"
                  data-active={theme() === id ? "" : undefined}
                  onClick={() => setTheme(id)}
                >
                  {THEMES[id]}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <PerformancePanel />
      <main class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto [&>*]:shrink-0 scroll-area bg-window">
        <DraggableList
          items={order()}
          onReorder={(next) => setStoredOrder(next)}
        >
          {(id, dragHandle) => {
            const Panel = PANELS[id];
            return <Panel dragHandle={dragHandle} />;
          }}
        </DraggableList>
      </main>

      <Console lines={lines()} onCommand={runCommand} />
    </div>
  );
}

render(() => <App />, document.getElementById("app")!);
