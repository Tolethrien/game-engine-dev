import { For, Show, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { DROPDOWN_ITEM, DropdownCheck, DropdownDivider } from "../blocks/dropdown";
import type { PanelId } from "../panels/registry";
import { addBoard, boards, isPinned, isPinnedTo, togglePin } from "../pins";

const PIN_MENU = {
  offset: 4,
};

export default function PinMenu(props: { id: PanelId }) {
  const [position, setPosition] = createSignal<{ top: number; right: number } | null>(null);
  let button!: HTMLButtonElement;
  let menu: HTMLDivElement | undefined;

  const close = () => setPosition(null);

  // the panel clips its overflow, so the menu lives in a portal positioned from the button
  function toggle() {
    if (position()) return close();
    const rect = button.getBoundingClientRect();
    setPosition({
      top: rect.bottom + PIN_MENU.offset,
      right: window.innerWidth - rect.right,
    });
  }

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Node;
    if (!button.contains(target) && !menu?.contains(target)) close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", close);
  onCleanup(() => {
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", close);
  });

  return (
    <>
      <button
        ref={button}
        type="button"
        class="cursor-pointer text-fg-dim hover:text-fg data-[active]:text-live"
        data-active={isPinned(props.id) ? "" : undefined}
        aria-pressed={isPinned(props.id)}
        aria-label="Pin panel to a Custom board"
        onClick={toggle}
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
      <Show when={position()}>
        {(current) => (
          <Portal>
            <div
              ref={menu}
              class="fixed z-50 min-w-44 border border-outline bg-panel py-1 shadow-lg"
              style={{ top: `${current().top}px`, right: `${current().right}px` }}
            >
              <For each={boards()}>
                {(board) => (
                  <DropdownCheck
                    checked={isPinnedTo(board.id, props.id)}
                    onClick={() => togglePin(board.id, props.id)}
                  >
                    {board.name}
                  </DropdownCheck>
                )}
              </For>
              <DropdownDivider />
              <button
                type="button"
                class={DROPDOWN_ITEM}
                onClick={() => {
                  addBoard([props.id]);
                  close();
                }}
              >
                <span class="w-3">+</span>
                <span class="flex-1">new board with this panel</span>
              </button>
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
