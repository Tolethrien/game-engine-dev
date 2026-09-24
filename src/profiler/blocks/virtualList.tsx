import {
  For,
  type JSX,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";

export default function VirtualList(props: {
  count: number;
  rowHeight: number;
  overscan?: number;
  children: (index: number) => JSX.Element;
}) {
  let viewport!: HTMLDivElement;
  const [scrollTop, setScrollTop] = createSignal(0);
  const [height, setHeight] = createSignal(0);
  const [stuck, setStuck] = createSignal(true);

  onMount(() => {
    setHeight(viewport.clientHeight);
    const observer = new ResizeObserver(() => setHeight(viewport.clientHeight));
    observer.observe(viewport);
    onCleanup(() => observer.disconnect());
  });

  const onScroll = () => {
    setScrollTop(viewport.scrollTop);
    setStuck(
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        props.rowHeight,
    );
  };

  const range = createMemo(() => {
    const overscan = props.overscan ?? 10;
    const start = Math.max(
      0,
      Math.floor(scrollTop() / props.rowHeight) - overscan,
    );
    const end = Math.min(
      props.count,
      Math.ceil((scrollTop() + height()) / props.rowHeight) + overscan,
    );
    const indices: number[] = [];
    for (let index = start; index < end; index++) indices.push(index);
    return indices;
  });

  createEffect(() => {
    props.count;
    if (!stuck()) return;
    viewport.scrollTop = viewport.scrollHeight;
    // the scroll event comes a frame later, until then the range would render the old window
    setScrollTop(viewport.scrollTop);
  });

  return (
    <div ref={viewport} onScroll={onScroll} class="h-full overflow-y-auto">
      <div
        class="relative"
        style={{ height: `${props.count * props.rowHeight}px` }}
      >
        <For each={range()}>
          {(index) => (
            <div
              class="absolute left-0 right-0"
              style={{
                top: `${index * props.rowHeight}px`,
                height: `${props.rowHeight}px`,
              }}
            >
              {props.children(index)}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
