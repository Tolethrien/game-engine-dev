import { For, Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { THEMES, THEME_IDS, activeTheme, setTheme } from "../theme";

const MENU_ITEM =
  "flex w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-body text-fg-dim hover:bg-divider hover:text-fg data-[active]:text-fg";

function Submenu(props: { title: string; children: JSX.Element }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div
      class="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        class={MENU_ITEM + " justify-between"}
        data-active={open() ? "" : undefined}
      >
        {props.title}
        <span>‹</span>
      </button>
      <Show when={open()}>
        <div class="absolute right-full top-0 min-w-32 border border-outline bg-panel py-1 shadow-lg">
          {props.children}
        </div>
      </Show>
    </div>
  );
}

export default function OptionsMenu() {
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
    <div ref={root} class="relative ml-auto">
      <button
        class="cursor-pointer px-3 py-1.5 text-body text-fg-dim hover:text-fg"
        title="Options"
        onClick={() => setOpen(!open())}
      >
        ⚙
      </button>
      <Show when={open()}>
        <div class="absolute right-0 top-full z-50 min-w-40 border border-outline bg-panel py-1 shadow-lg">
          <Submenu title="Theme">
            <For each={THEME_IDS}>
              {(id) => (
                <button
                  class={MENU_ITEM}
                  data-active={activeTheme() === id ? "" : undefined}
                  onClick={() => setTheme(id)}
                >
                  <span class="w-3 text-live">
                    {activeTheme() === id ? "✓" : ""}
                  </span>
                  {THEMES[id]}
                </button>
              )}
            </For>
          </Submenu>
        </div>
      </Show>
    </div>
  );
}
