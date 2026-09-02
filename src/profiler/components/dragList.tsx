import { For, createSignal, JSX } from "solid-js";
import type { DragHandle } from "./panel";

export default function DraggableList<Item extends string>(props: {
  items: Item[];
  onReorder: (newOrder: Item[]) => void;
  children: (item: Item, dragHandle: DragHandle) => JSX.Element;
}) {
  const [dragging, setDragging] = createSignal<Item | null>(null);

  const moveItem = (dragged: Item, target: Item, insertAfter: boolean) => {
    const next = props.items.filter((item) => item !== dragged);
    const targetIndex = next.indexOf(target);
    next.splice(insertAfter ? targetIndex + 1 : targetIndex, 0, dragged);

    const unchanged = next.every((item, index) => item === props.items[index]);
    if (unchanged) return;

    props.onReorder(next);
  };

  return (
    <For each={props.items}>
      {(item) => (
        <div
          class="group/drag"
          data-dragging={dragging() === item ? "" : undefined}
          onDragOver={(event) => {
            event.preventDefault();
            const dragged = dragging();
            if (!dragged || dragged === item) return;

            const bounds = event.currentTarget.getBoundingClientRect();
            const insertAfter = event.clientY > bounds.top + bounds.height / 2;
            moveItem(dragged, item, insertAfter);
          }}
        >
          {props.children(item, {
            draggable: true,
            onDragStart: () => setDragging(() => item),
            onDragEnd: () => setDragging(null),
          })}
        </div>
      )}
    </For>
  );
}
