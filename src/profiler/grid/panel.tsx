import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import {
  PANELS,
  panelTitle,
  type PanelDefinition,
  type PanelId,
} from "../panels/registry";
import { isPinned, togglePin } from "../pins";
import { gridArea, type Area, type Cell } from "./layouts";

export default function Panel(props: {
  id: PanelId;
  area: Area;
  draggable: boolean;
  dragOffset?: Cell;
  onGrab: (event: PointerEvent) => void;
}) {
  const definition = (): PanelDefinition => PANELS[props.id];
  const live = () => definition().live?.() ?? true;

  return (
    <section
      class="@container flex flex-col overflow-hidden rounded-panel border border-outline bg-panel"
      classList={{ "z-10 opacity-60 shadow-lg": !!props.dragOffset }}
      style={{
        ...gridArea(props.area),
        transform: props.dragOffset
          ? `translate(${props.dragOffset.x}px, ${props.dragOffset.y}px)`
          : undefined,
      }}
    >
      <header
        class="flex h-panel-head shrink-0 items-center gap-2 border-b border-divider px-2"
        classList={{
          "touch-none select-none": props.draggable,
          "cursor-grab": props.draggable && !props.dragOffset,
          "cursor-grabbing": !!props.dragOffset,
        }}
        onPointerDown={(event) => props.draggable && props.onGrab(event)}
      >
        <span class="min-w-0 truncate text-caption uppercase tracking-[0.1em] text-fg-dim">
          {panelTitle(definition())}
        </span>
        <div class="ml-auto flex items-center">
          <button
            class="cursor-pointer text-fg-dim hover:text-fg data-[active]:text-live"
            data-active={isPinned(props.id) ? "" : undefined}
            aria-pressed={isPinned(props.id)}
            aria-label="Pin panel to Custom"
            onClick={() => togglePin(props.id)}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill={isPinned(props.id) ? "currentColor" : "none"}
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            >
              <path d="M5 2h6l-1 5 3 3H3l3-3-1-5zM8 10v5" />
            </svg>
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-hidden p-2 text-body">
        <Show
          when={live()}
          fallback={<span class="italic text-fg-dim">waiting for game</span>}
        >
          <Dynamic component={definition().component} />
        </Show>
      </div>
    </section>
  );
}
