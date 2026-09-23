import type { JSX } from "solid-js";

export function Rows(props: { children: JSX.Element }) {
  return (
    <div class="flex h-full min-h-0 w-full min-w-0 flex-col gap-2">
      {props.children}
    </div>
  );
}

export function Cols(props: { children: JSX.Element }) {
  return (
    <div class="flex h-full min-h-0 w-full min-w-0 flex-row gap-2">
      {props.children}
    </div>
  );
}

// min-h-0/min-w-0 on "fill" is what keeps long content scrolling inside instead of stretching the panel
export function Block(props: {
  size?: "fit" | "fill";
  class?: string;
  children: JSX.Element;
}) {
  const fill = () => props.size === "fill";
  return (
    <div
      class={props.class}
      classList={{
        "shrink-0": !fill(),
        "min-h-0 min-w-0 flex-1 overflow-auto": fill(),
      }}
    >
      {props.children}
    </div>
  );
}
