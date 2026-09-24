import {
  childrenOf,
  hasDetails,
  sourceLines,
} from "@/core/debugger/modules/log/format";
import type {
  LogEntryOf,
  SerializedValue,
} from "@/core/debugger/modules/log/report";
import type { ConsoleEntry } from "./store";

export type ConsoleRow =
  | { type: "entry"; key: string; entry: ConsoleEntry; source: LogEntryOf<"entry"> }
  | { type: "valve"; key: string; entry: ConsoleEntry; source: LogEntryOf<"valve"> }
  | { type: "separator"; key: string; entry: ConsoleEntry; source: LogEntryOf<"separator"> }
  | { type: "text"; key: string; entry: ConsoleEntry; line: string }
  | { type: "code"; key: string; entry: ConsoleEntry; depth: number; line: string }
  | {
      type: "value";
      key: string;
      entry: ConsoleEntry;
      depth: number;
      label: string;
      value: SerializedValue;
      expandable: boolean;
    };

export type ConsoleRowOf<Type extends ConsoleRow["type"]> = Extract<
  ConsoleRow,
  { type: Type }
>;

// one head row per entry for its whole life: re-flattening 100k entries every frame
// must not allocate 100k rows; mutable fields (repeat, suppressed) are read through version()
const headRows = new WeakMap<ConsoleEntry, ConsoleRow>();

export function headRow(entry: ConsoleEntry): ConsoleRow {
  let row = headRows.get(entry);
  if (row) return row;
  const key = String(entry.source.id);
  const source = entry.source;
  if (source.kind === "entry") row = { type: "entry", key, entry, source };
  else if (source.kind === "valve") row = { type: "valve", key, entry, source };
  else row = { type: "separator", key, entry, source };
  headRows.set(entry, row);
  return row;
}

export function flattenRows(
  entries: readonly ConsoleEntry[],
  expanded: ReadonlySet<string>,
): ConsoleRow[] {
  const rows: ConsoleRow[] = [];

  const pushChildren = (
    entry: ConsoleEntry,
    value: SerializedValue,
    parentKey: string,
    depth: number,
  ) => {
    sourceLines(value).forEach((line, index) => {
      rows.push({ type: "code", key: `${parentKey}:c${index}`, entry, depth: depth + 1, line });
    });
    for (const [label, child] of childrenOf(value)) {
      const key = `${parentKey}/${label}`;
      const expandable = hasDetails(child);
      rows.push({ type: "value", key, entry, depth: depth + 1, label, value: child, expandable });
      if (expandable && expanded.has(key)) pushChildren(entry, child, key, depth + 1);
    }
  };

  for (const entry of entries) {
    const head = headRow(entry);
    rows.push(head);
    if (head.type !== "entry" || !expanded.has(head.key)) continue;
    if (!(entry.multiline || entry.hasObject)) continue;
    const key = head.key;

    entry.text
      .split("\n")
      .slice(1)
      .forEach((line, index) => {
        rows.push({ type: "text", key: `${key}:t${index}`, entry, line });
      });

    const objectParts = head.source.parts
      .map((part, index) => ({ part, index }))
      .filter(({ part }) => hasDetails(part));
    const autoOpen = objectParts.length === 1;
    for (const { part, index } of objectParts) {
      const partKey = `${key}/${index}`;
      rows.push({ type: "value", key: partKey, entry, depth: 0, label: "", value: part, expandable: true });
      if (autoOpen || expanded.has(partKey)) pushChildren(entry, part, partKey, 0);
    }
  }
  return rows;
}
