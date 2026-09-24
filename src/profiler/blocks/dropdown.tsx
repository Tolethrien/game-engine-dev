import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";

export const DROPDOWN_ITEM =
  "flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1 text-left text-body text-fg-dim hover:bg-divider hover:text-fg";

export default function Dropdown(props: {
  label: JSX.Element;
  title?: string;
  highlighted?: boolean;
  align?: "left" | "right";
  children: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;

  onMount(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <div ref={root} class="relative shrink-0">
      <button
        type="button"
        title={props.title}
        class="cursor-pointer rounded border border-divider px-1.5 hover:text-fg"
        classList={{ "text-live": props.highlighted, "text-fg": !props.highlighted }}
        onClick={() => setOpen(!open())}
      >
        {props.label} ▾
      </button>
      <Show when={open()}>
        <div
          class="absolute top-full z-50 mt-1 min-w-44 border border-outline bg-panel py-1 shadow-lg"
          classList={{ "right-0": props.align === "right", "left-0": props.align !== "right" }}
        >
          {props.children}
        </div>
      </Show>
    </div>
  );
}

export function DropdownCheck(props: {
  checked: boolean;
  onClick: (event: MouseEvent) => void;
  title?: string;
  trailing?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <button type="button" class={DROPDOWN_ITEM} title={props.title} onClick={props.onClick}>
      <span class="w-3 text-live">{props.checked ? "✓" : ""}</span>
      <span class="flex-1">{props.children}</span>
      <Show when={props.trailing !== undefined}>
        <span class="tabular-nums text-fg-dim">{props.trailing}</span>
      </Show>
    </button>
  );
}

export function DropdownDivider() {
  return <div class="my-1 h-px bg-divider" />;
}

export function DropdownHint(props: { children: JSX.Element }) {
  return <div class="px-3 py-1 text-caption text-fg-dim">{props.children}</div>;
}
