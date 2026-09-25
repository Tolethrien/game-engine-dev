import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import AxiomMath from "@/core/axiom/math";
import Panel from "./panel";
import LayoutBar from "./layoutBar";
import { panelDefinition, panelTitle, type PanelId } from "../panels/registry";
import {
  gridArea,
  moveItem,
  resolveManual,
  shelf,
  skyline,
  sortItems,
  type AutoLayoutMode,
  type Cell,
  type LayoutItem,
  type LayoutMode,
  type Placement,
} from "./layouts";
import { tabLayout } from "./layoutState";

interface Drag {
  id: PanelId;
  origin: Cell;
  offset: Cell;
  target: Cell;
  preview: Placement;
}

export default function Grid(props: {
  tabId: string;
  panels: PanelId[];
  empty?: string;
  actions?: Component;
}) {
  let container: HTMLDivElement | undefined;
  let grid: HTMLDivElement | undefined;
  const metrics = { cell: 0, gap: 0 };
  const [columns, setColumns] = createSignal(1);
  const [drag, setDrag] = createSignal<Drag>();
  const state = () => tabLayout(props.tabId);

  onMount(() => {
    const style = getComputedStyle(container!);
    metrics.cell = parseFloat(style.getPropertyValue("--grid-cell"));
    metrics.gap = parseFloat(style.getPropertyValue("--grid-gap"));

    const observer = new ResizeObserver(([entry]) => {
      const fitting = Math.floor(
        (entry.contentRect.width + metrics.gap) / (metrics.cell + metrics.gap),
      );
      setColumns(Math.max(1, fitting));
    });
    observer.observe(container!);
    onCleanup(() => observer.disconnect());
  });

  // a span wider than the grid would create implicit columns past the window edge
  const items = createMemo(() =>
    props.panels.map((id): LayoutItem => {
      const definition = panelDefinition(id);
      return {
        id,
        title: panelTitle(definition),
        w: Math.min(definition.size.w, columns()),
        h: definition.size.h,
      };
    }),
  );
  const itemById = createMemo(
    () => new Map(items().map((item) => [item.id, item])),
  );

  const autoPlacement = (mode: AutoLayoutMode) => {
    const sorted = sortItems(items(), state().layout().sort);
    return mode === "shelf"
      ? shelf(sorted, columns())
      : skyline(sorted, columns());
  };

  const placement = createMemo(() => {
    const { mode, positions } = state().layout();
    return mode === "manual"
      ? resolveManual(items(), columns(), positions)
      : autoPlacement(mode);
  });

  const areaOf = (id: PanelId, cell: Cell | undefined) => {
    const item = itemById().get(id);
    return { x: cell?.x ?? 0, y: cell?.y ?? 0, w: item?.w ?? 1, h: item?.h ?? 1 };
  };

  function selectMode(mode: LayoutMode) {
    const { layout, update } = state();
    // entering manual without a saved layout starts from what is currently on screen
    if (mode === "manual" && Object.keys(layout().positions).length === 0) {
      update({ mode, positions: Object.fromEntries(placement()) });
    } else {
      update({ mode });
    }
  }

  function reset() {
    const clean = skyline(sortItems(items(), "size"), columns());
    state().update({ positions: Object.fromEntries(clean) });
  }

  function targetCell(left: number, top: number, width: number): Cell {
    const columnWidth =
      (grid!.clientWidth - metrics.gap * (columns() - 1)) / columns();
    return {
      x: AxiomMath.clamp(
        Math.round(left / (columnWidth + metrics.gap)),
        0,
        columns() - width,
      ),
      y: Math.max(0, Math.round(top / (metrics.cell + metrics.gap))),
    };
  }

  function grab(id: PanelId, event: PointerEvent) {
    if (state().layout().mode !== "manual" || event.button !== 0 || drag()) return;
    if ((event.target as Element).closest("button")) return;

    const handle = event.currentTarget as HTMLElement;
    const panelRect = handle.closest("section")!.getBoundingClientRect();
    const gridRect = grid!.getBoundingClientRect();
    // relative to the grid, so scrolling during the drag does not shift the target cell
    const panelStart = {
      x: panelRect.left - gridRect.left,
      y: panelRect.top - gridRect.top,
    };
    const pointerStart = { x: event.clientX, y: event.clientY };
    const pointerId = event.pointerId;
    const snapshot = placement();
    const origin = snapshot.get(id)!;
    const width = itemById().get(id)!.w;
    let finished = false;

    setDrag({ id, origin, offset: { x: 0, y: 0 }, target: origin, preview: snapshot });
    handle.setPointerCapture(pointerId);
    event.preventDefault();

    const move = (moveEvent: PointerEvent) => {
      const current = drag()!;
      const offset = {
        x: moveEvent.clientX - pointerStart.x,
        y: moveEvent.clientY - pointerStart.y,
      };
      const target = targetCell(
        panelStart.x + offset.x,
        panelStart.y + offset.y,
        width,
      );
      const changed =
        target.x !== current.target.x || target.y !== current.target.y;
      setDrag({
        ...current,
        offset,
        target,
        preview: changed
          ? moveItem(items(), snapshot, id, target)
          : current.preview,
      });
    };

    const finish = (commit: boolean) => {
      if (finished) return;
      finished = true;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", release);
      handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", escape);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);

      const current = drag();
      setDrag(undefined);
      if (commit && current) {
        state().update({ positions: Object.fromEntries(current.preview) });
      }
    };

    const release = (upEvent: PointerEvent) => {
      const inside =
        upEvent.clientX >= 0 &&
        upEvent.clientY >= 0 &&
        upEvent.clientX < window.innerWidth &&
        upEvent.clientY < window.innerHeight;
      finish(inside);
    };
    const cancel = () => finish(false);
    const escape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") finish(false);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", release);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", escape);
  }

  return (
    <div class="flex h-full min-h-0 flex-col">
      <LayoutBar
        layout={state().layout()}
        onMode={selectMode}
        onSort={(sort) => state().update({ sort })}
        onReset={reset}
        actions={props.actions}
      />
      <div ref={container} class="min-h-0 flex-1 overflow-y-auto p-2">
        <Show
          when={props.panels.length > 0}
          fallback={
            <p class="p-1 text-body text-fg-dim">{props.empty ?? "no panels"}</p>
          }
        >
          <div
            ref={grid}
            class="grid gap-(--grid-gap) auto-rows-(--grid-cell)"
            style={{
              "grid-template-columns": `repeat(${columns()}, minmax(0, 1fr))`,
            }}
          >
            <Show when={drag()}>
              {(current) => (
                <div
                  class="pointer-events-none rounded-panel border border-dashed border-live/60 bg-live/5"
                  style={gridArea(
                    areaOf(current().id, current().preview.get(current().id)),
                  )}
                />
              )}
            </Show>
            <For each={props.panels}>
              {(id) => {
                // the dragged panel stays in its original cell and follows the cursor via transform
                const dragged = () =>
                  drag()?.id === id ? drag() : undefined;
                return (
                  <Panel
                    id={id}
                    area={areaOf(
                      id,
                      dragged()?.origin ??
                        (drag()?.preview ?? placement()).get(id),
                    )}
                    draggable={state().layout().mode === "manual"}
                    dragOffset={dragged()?.offset}
                    onGrab={(event) => grab(id, event)}
                  />
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
