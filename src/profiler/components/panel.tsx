import { JSX, Show, createContext, useContext } from "solid-js";
import { useLocalStorage } from "../hooks/useLocalStorage";

export interface DragHandle {
  draggable: true;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export interface PanelProps {
  dragHandle?: DragHandle;
}

interface PanelSurfaceValue {
  surface: "head" | "body";
  isPinned: (slotId: string) => boolean;
  pinnedIndex: (slotId: string) => number;
  togglePin: (slotId: string) => void;
}

const PanelSurface = createContext<PanelSurfaceValue>();

export default function CollapsiblePanel(props: {
  id: string;
  title: string;
  live?: boolean;
  defaultPinned?: string[];
  children?: JSX.Element;
  dragHandle?: DragHandle;
}) {
  const [expanded, setExpanded] = useLocalStorage(
    `${props.id}.expanded`,
    false,
  );
  const [pinnedIds, setPinnedIds] = useLocalStorage<string[]>(
    `${props.id}.pinned`,
    props.defaultPinned ?? [],
  );

  const isLive = () => props.live ?? true;

  const togglePin = (slotId: string) =>
    setPinnedIds((previous) =>
      previous.includes(slotId)
        ? previous.filter((id) => id !== slotId)
        : [...previous, slotId],
    );

  const surfaceValue = (surface: "head" | "body"): PanelSurfaceValue => ({
    surface,
    isPinned: (slotId) => pinnedIds().includes(slotId),
    pinnedIndex: (slotId) => pinnedIds().indexOf(slotId),
    togglePin,
  });

  return (
    <section
      class="group/panel overflow-hidden rounded-panel border border-outline bg-panel-body transition-[border-color,opacity] duration-150 hover:border-outline-hover group-data-[dragging]/drag:border-dashed group-data-[dragging]/drag:opacity-35"
      data-stale={!isLive() ? "" : undefined}
    >
      <div class="flex h-panel-head items-center gap-gutter bg-panel-head px-2 transition-colors duration-150 group-hover/panel:bg-panel-head-hover">
        <button
          class="flex h-full cursor-pointer select-none items-center gap-[9px] rounded-control px-1 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-live"
          onClick={() => setExpanded(!expanded())}
          aria-expanded={expanded()}
        >
          <span
            class="h-0 w-0 border-y-4 border-l-[5px] border-y-transparent border-l-fg-dim transition-transform duration-100"
            classList={{ "rotate-90": expanded() }}
          />
          <span class="min-w-[72px] text-left text-body font-semibold tracking-[0.01em] text-fg">
            {props.title}
          </span>
        </button>

        <span
          class="size-[5px] shrink-0 rounded-full bg-live transition-colors duration-200 group-data-[stale]/panel:animate-[panel-pulse_1.6s_ease-in-out_infinite] group-data-[stale]/panel:bg-stale"
          title={isLive() ? "receiving data" : "waiting for game"}
        />

        <div class="relative flex h-full min-w-0 flex-1 items-center gap-3.5 pl-2.5 before:absolute before:left-0 before:top-[20%] before:h-3/5 before:w-px before:bg-outline before:content-['']">
          <Show
            when={isLive()}
            fallback={
              <span class="text-note italic text-fg-dim">waiting for game</span>
            }
          >
            <PanelSurface.Provider value={surfaceValue("head")}>
              {props.children}
            </PanelSurface.Provider>
          </Show>
        </div>

        <Show when={props.dragHandle}>
          <span
            class="ml-auto grid size-row shrink-0 cursor-grab place-items-center text-glyph leading-none text-fg-dim opacity-50 transition-[opacity,color] duration-150 hover:text-fg active:cursor-grabbing group-hover/panel:opacity-100"
            draggable={props.dragHandle!.draggable}
            onDragStart={props.dragHandle!.onDragStart}
            onDragEnd={props.dragHandle!.onDragEnd}
          >
            ⠿
          </span>
        </Show>
      </div>

      <Show when={expanded()}>
        <div class="@container/body flex flex-col gap-0.5 px-3 pb-2.5 pt-2 text-body leading-normal text-fg">
          <Show
            when={isLive()}
            fallback={
              <span class="text-note italic text-fg-dim">
                no data from this session
              </span>
            }
          >
            <PanelSurface.Provider value={surfaceValue("body")}>
              {props.children}
            </PanelSurface.Provider>
          </Show>
        </div>
      </Show>
    </section>
  );
}

export function Slot(props: {
  id?: string;
  align?: "left" | "center" | "right";
  pinnable?: boolean;
  children: JSX.Element;
}) {
  const panel = useContext(PanelSurface);
  if (!panel) throw new Error("Slot must be used inside CollapsiblePanel");

  const isHead = panel.surface === "head";
  const align = () => props.align ?? "left";
  const canPin = () => (props.pinnable ?? true) && props.id !== undefined;
  const isPinned = () => canPin() && panel.isPinned(props.id!);
  const visible = () => !isHead || isPinned();
  const showSpacer = () => !isHead && !canPin() && align() === "left";

  return (
    <Show when={visible()}>
      <div
        class={
          isHead
            ? "group/slot flex shrink-0 items-center gap-gutter"
            : "group/slot flex min-h-row items-start gap-gutter"
        }
        classList={{
          "justify-center": !isHead && align() === "center",
          "justify-end": !isHead && align() === "right",
        }}
        data-surface={panel.surface}
        style={isHead ? { order: panel.pinnedIndex(props.id!) } : undefined}
      >
        <Show when={!isHead && canPin()}>
          <button
            class="grid size-pin shrink-0 cursor-pointer place-items-center p-0 text-fg-dim opacity-45 transition-[opacity,color] duration-100 group-hover/slot:opacity-100 data-[pinned]:text-fg data-[pinned]:opacity-100"
            classList={{ "order-1": align() === "right" }}
            data-pinned={isPinned() ? "" : undefined}
            onClick={() => panel.togglePin(props.id!)}
            title={isPinned() ? "Unpin from header" : "Pin to header"}
          >
            <svg
              class="size-[11px] stroke-current [stroke-linejoin:round] [stroke-width:1.6]"
              classList={{
                "fill-current": isPinned(),
                "fill-none": !isPinned(),
              }}
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path d="M5 2h6v12l-3-3-3 3z" />
            </svg>
          </button>
        </Show>

        <Show when={showSpacer()}>
          <span class="w-pin shrink-0" />
        </Show>

        <div
          class={
            isHead
              ? "flex flex-none items-center gap-gutter"
              : "flex min-w-0 items-center gap-gutter"
          }
          classList={{ "flex-1": !isHead && align() === "left" }}
        >
          {props.children}
        </div>
      </div>
    </Show>
  );
}
export function SlotGroup(props: { children: JSX.Element }) {
  const panel = useContext(PanelSurface);
  if (!panel) throw new Error("SlotGroup must be used inside CollapsiblePanel");

  if (panel.surface === "head") return <>{props.children}</>;
  return (
    <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-gutter @max-[30rem]/body:grid-cols-2 @max-[16rem]/body:grid-cols-1 [&>*]:min-w-0">
      {props.children}
    </div>
  );
}
export function Section(props: { children: JSX.Element }) {
  const panel = useContext(PanelSurface);
  if (!panel) throw new Error("Section must be used inside CollapsiblePanel");
  if (panel.surface === "head") return null;

  return (
    <div class="flex items-center gap-2 pb-0.5 pt-2 first:pt-0 cursor-default select-none">
      <span class="h-px flex-1 bg-divider" />
      <span class="text-caption uppercase tracking-[0.12em] text-fg-dim">
        {props.children}
      </span>
      <span class="h-px flex-1 bg-divider" />
    </div>
  );
}
