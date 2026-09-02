import { JSX } from "solid-js";

export function Table(props: {
  columns: string;
  fill?: boolean;
  children: JSX.Element;
}) {
  return (
    <div
      class="grid overflow-hidden rounded-control border border-table-outline"
      classList={{ "w-full": props.fill, "w-fit": !props.fill }}
      style={{ "grid-template-columns": props.columns }}
    >
      {props.children}
    </div>
  );
}

export function TableRow(props: { head?: boolean; children: JSX.Element }) {
  return (
    <div class="group/row contents" data-head={props.head ? "" : undefined}>
      {props.children}
    </div>
  );
}

export function TableCell(props: { align?: "right"; children: JSX.Element }) {
  return (
    <div
      class="truncate border-t border-table-line px-2 py-1 group-data-[head]/row:border-t-0 group-data-[head]/row:bg-panel-head group-data-[head]/row:text-caption group-data-[head]/row:uppercase group-data-[head]/row:tracking-wider group-data-[head]/row:text-fg-dim"
      classList={{ "text-right tabular-nums": props.align === "right" }}
    >
      {props.children}
    </div>
  );
}
