import { Match, Show, Switch } from "solid-js";
import { formatTime } from "@/core/debugger/modules/log/format";
import Highlight from "../blocks/highlight";
import ValuePreview, { labelClass } from "../blocks/valuePreview";
import type { ConsoleRow, ConsoleRowOf } from "./flatten";
import {
  CONSOLE,
  LEVEL_STYLE,
  expanded,
  toggleExpanded,
  version,
} from "./store";

const ROW = {
  base: "flex h-full items-center gap-2 whitespace-nowrap px-2 text-body hover:bg-titlebar",
  badge: "shrink-0 rounded bg-divider px-1.5 text-fg-dim",
  // lines under an entry start where its message does
  contentIndent: 140,
  depthIndent: 12,
};

function isRow<Type extends ConsoleRow["type"]>(
  row: ConsoleRow,
  type: Type,
): row is ConsoleRowOf<Type> {
  return row.type === type;
}

function rowOf<Type extends ConsoleRow["type"]>(row: ConsoleRow, type: Type) {
  return isRow(row, type) ? row : false;
}

function Arrow(props: { rowKey: string }) {
  return (
    <span class="w-3 shrink-0 text-fg-dim">
      {expanded().has(props.rowKey) ? "▾" : "▸"}
    </span>
  );
}

function Prefix(props: {
  letter: string;
  bar: string;
  frame: number;
  time: number;
  scope: string;
  query: string;
}) {
  return (
    <>
      <span class={`w-4 shrink-0 text-center text-window ${props.bar}`}>
        {props.letter}
      </span>
      <span class="w-12 shrink-0 text-right tabular-nums text-fg-dim">
        {props.frame}
      </span>
      <span class="shrink-0 tabular-nums text-fg-dim">
        {formatTime(props.time)}
      </span>
      <span class="shrink-0 text-fg">
        [<Highlight text={props.scope} query={props.query} />]
      </span>
    </>
  );
}

function EntryRow(props: { row: ConsoleRowOf<"entry">; query: string }) {
  const style = () => LEVEL_STYLE[props.row.source.level];
  const expandable = () => props.row.entry.multiline || props.row.entry.hasObject;
  const firstLine = () => props.row.entry.text.split("\n", 1)[0];
  // repeat and suppressed mutate in place, the row object stays the same
  const repeat = () => {
    version();
    return props.row.entry.repeat;
  };
  const suppressed = () => {
    version();
    return props.row.entry.suppressed;
  };

  return (
    <div
      class={`${ROW.base} ${expandable() ? "cursor-pointer" : ""}`}
      onClick={() => expandable() && toggleExpanded(props.row.key)}
    >
      <Prefix
        letter={style().letter}
        bar={style().bar}
        frame={props.row.source.frame}
        time={props.row.source.time}
        scope={props.row.source.scope}
        query={props.query}
      />
      <Show when={expandable()}>
        <Arrow rowKey={props.row.key} />
      </Show>
      <span class={`min-w-0 truncate ${style().text}`} title={props.row.entry.text}>
        <Highlight text={firstLine()} query={props.query} />
      </span>
      <Show when={repeat() > 1}>
        <span class={ROW.badge}>×{repeat()}</span>
      </Show>
      <Show when={suppressed()}>
        {(value) => (
          <span class={ROW.badge}>
            {value().reason === "changed"
              ? `×${value().count} unchanged`
              : `+${value().count} skipped`}
          </span>
        )}
      </Show>
    </div>
  );
}

function ValveRow(props: { row: ConsoleRowOf<"valve"> }) {
  return (
    <div class={ROW.base}>
      <Prefix
        letter="W"
        bar="bg-warn"
        frame={props.row.source.frame}
        time={props.row.source.time}
        scope="debug"
        query=""
      />
      <span class="min-w-0 truncate text-warn">{props.row.entry.text}</span>
    </div>
  );
}

function SeparatorRow(props: { row: ConsoleRowOf<"separator"> }) {
  return (
    <div
      class={`${ROW.base} justify-center border-b border-dashed ${
        props.row.source.reload
          ? "border-solid border-warn bg-warn/15 text-warn"
          : "border-warn text-warn"
      }`}
    >
      ── {props.row.entry.text} ──
    </div>
  );
}

function TextRow(props: { row: ConsoleRowOf<"text">; query: string }) {
  const color = () => {
    const source = props.row.entry.source;
    return source.kind === "entry" ? LEVEL_STYLE[source.level].text : "text-fg";
  };
  return (
    <div class={ROW.base} style={{ "padding-left": `${ROW.contentIndent}px` }}>
      <span class={`min-w-0 truncate ${color()}`}>
        <Highlight text={props.row.line} query={props.query} />
      </span>
    </div>
  );
}

function CodeRow(props: { row: ConsoleRowOf<"code"> }) {
  return (
    <div
      class={ROW.base}
      style={{
        "padding-left": `${ROW.contentIndent + props.row.depth * ROW.depthIndent}px`,
      }}
    >
      <span class="min-w-0 truncate whitespace-pre text-fg-dim">{props.row.line}</span>
    </div>
  );
}

function ValueRow(props: { row: ConsoleRowOf<"value"> }) {
  return (
    <div
      class={ROW.base}
      style={{
        "padding-left": `${ROW.contentIndent + props.row.depth * ROW.depthIndent}px`,
      }}
    >
      <Show when={props.row.expandable} fallback={<span class="w-3 shrink-0" />}>
        <span class="cursor-pointer" onClick={() => toggleExpanded(props.row.key)}>
          <Arrow rowKey={props.row.key} />
        </span>
      </Show>
      <Show when={props.row.label !== ""}>
        <span class={`shrink-0 ${labelClass(props.row.label)}`}>
          {props.row.label}
          <span class="text-syntax-punct">: </span>
        </span>
      </Show>
      <span class="min-w-0 truncate text-fg">
        <ValuePreview value={props.row.value} maxLength={CONSOLE.previewLength} />
      </span>
    </div>
  );
}

export default function ConsoleRowView(props: { row: ConsoleRow; query: string }) {
  return (
    <Switch>
      <Match when={rowOf(props.row, "entry")}>
        {(row) => <EntryRow row={row()} query={props.query} />}
      </Match>
      <Match when={rowOf(props.row, "valve")}>
        {(row) => <ValveRow row={row()} />}
      </Match>
      <Match when={rowOf(props.row, "separator")}>
        {(row) => <SeparatorRow row={row()} />}
      </Match>
      <Match when={rowOf(props.row, "text")}>
        {(row) => <TextRow row={row()} query={props.query} />}
      </Match>
      <Match when={rowOf(props.row, "code")}>
        {(row) => <CodeRow row={row()} />}
      </Match>
      <Match when={rowOf(props.row, "value")}>
        {(row) => <ValueRow row={row()} />}
      </Match>
    </Switch>
  );
}
