// Shared by the game, the main process (dump) and the profiler: no DOM, no Node.
import type { LogEntry, SerializedValue } from "./report";

const FORMAT = {
  partPreviewLength: 200,
  indent: "  ",
  entryIndent: "    ",
  moreKey: "…",
};

// devtools mirror prefix; main drops console-message lines starting with it, so both must share it
export const LOG_MIRROR_TAG = "[debug]";

export function formatTime(ms: number) {
  const date = new Date(ms);
  const pad = (value: number, length = 2) =>
    String(value).padStart(length, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export type SyntaxKind =
  | "key"
  | "string"
  | "number"
  | "keyword"
  | "nullish"
  | "type"
  | "function"
  | "punct"
  | "plain";

export interface PreviewToken {
  text: string;
  kind: SyntaxKind;
}

export function previewTokens(
  value: SerializedValue,
  maxLength: number,
): PreviewToken[] {
  const tokens: PreviewToken[] = [];
  preview(value, true, maxLength, tokens);
  if (textLength(tokens, 0) <= maxLength) return tokens;
  const clipped: PreviewToken[] = [];
  let remaining = maxLength - 1;
  for (const token of tokens) {
    if (remaining <= 0) break;
    if (token.text.length <= remaining) {
      clipped.push(token);
      remaining -= token.text.length;
    } else {
      clipped.push({ text: token.text.slice(0, remaining), kind: token.kind });
      break;
    }
  }
  clipped.push({ text: "…", kind: "punct" });
  return clipped;
}

export function formatPreview(value: SerializedValue, maxLength: number) {
  return previewTokens(value, maxLength)
    .map((token) => token.text)
    .join("");
}

export function formatParts(parts: SerializedValue[]) {
  return parts
    .map((part) =>
      part.type === "string"
        ? part.more > 0
          ? `${part.value}… (${part.more} more)`
          : part.value
        : formatPreview(part, FORMAT.partPreviewLength),
    )
    .join(" ");
}

export function sourceLines(value: SerializedValue): string[] {
  if (value.type !== "function" || value.source === "") return [];
  const lines = value.source.split("\n");
  if (value.more > 0) lines.push(`… ${value.more} more characters`);
  return lines;
}

export function isMoreLabel(label: string) {
  return label === FORMAT.moreKey;
}

// anything the UI can expand: nested values or a function body
export function hasDetails(value: SerializedValue) {
  return childrenOf(value).length > 0 || sourceLines(value).length > 0;
}

export function childrenOf(
  value: SerializedValue,
): [string, SerializedValue][] {
  switch (value.type) {
    case "object":
      return withMore(value.entries, value.more);
    case "array":
      return withMore(
        value.items.map((item, index) => [String(index), item]),
        value.more,
      );
    case "map":
      return [
        [
          "[[entries]]",
          {
            type: "array",
            className: "Array",
            length: value.entries.length + value.more,
            items: value.entries.map(([key, item]) => ({
              type: "object",
              className: "entry",
              entries: [
                ["key", key],
                ["value", item],
              ],
              more: 0,
            })),
            more: value.more,
          },
        ],
      ];
    case "set":
      return [
        [
          "[[entries]]",
          {
            type: "array",
            className: "Array",
            length: value.items.length + value.more,
            items: value.items,
            more: value.more,
          },
        ],
      ];
    case "error":
      return [
        ["name", stringValue(value.name)],
        ["message", stringValue(value.message)],
        ["stack", stringValue(value.stack)],
      ];
    case "gpu":
      return [
        ["label", stringValue(value.label)],
        ...value.info.map(([key, info]): [string, SerializedValue] => [
          key,
          stringValue(info),
        ]),
      ];
    default:
      return [];
  }
}

export function formatValue(value: SerializedValue, indent = 0): string {
  const children = childrenOf(value);
  const source = sourceLines(value);
  if (source.length > 0)
    return source.join(`\n${FORMAT.indent.repeat(indent + 1)}`);
  if (children.length === 0) {
    if (value.type === "string" && value.value.includes("\n"))
      return value.value
        .split("\n")
        .join(`\n${FORMAT.indent.repeat(indent + 1)}`);
    return formatPreview(value, Infinity);
  }
  const pad = FORMAT.indent.repeat(indent + 1);
  const lines = children.map(
    ([key, child]) => `${pad}${key}: ${formatValue(child, indent + 1)}`,
  );
  const name =
    value.type === "object" && value.className === "Object"
      ? ""
      : `${header(value)} `;
  return `${name}{\n${lines.join("\n")}\n${FORMAT.indent.repeat(indent)}}`;
}

export function formatEntry(entry: LogEntry) {
  const time = `[${formatTime(entry.time)}]`;
  switch (entry.kind) {
    case "separator":
      return `${time} ──────── ${entry.label} ────────`;
    case "valve":
      return `${time}[f${entry.frame}][VALVE] dropped ${entry.dropped} entries over the per-frame limit`;
    case "entry": {
      const suppressed = entry.suppressed
        ? ` (×${entry.suppressed.count + 1}, ${entry.suppressed.reason})`
        : "";
      const head = `${time}[f${entry.frame}][${entry.scope}][${entry.level.toUpperCase()}] `;
      const lines = [indentLines(formatParts(entry.parts) + suppressed)];
      for (const part of entry.parts)
        if (hasDetails(part))
          lines.push(FORMAT.entryIndent + indentLines(formatValue(part)));
      return head + lines.join("\n");
    }
  }
}

function push(tokens: PreviewToken[], text: string, kind: SyntaxKind): void {
  tokens.push({ text, kind });
}

function textLength(tokens: PreviewToken[], from: number) {
  let length = 0;
  for (let index = from; index < tokens.length; index++)
    length += tokens[index].text.length;
  return length;
}

function preview(
  value: SerializedValue,
  top: boolean,
  budget: number,
  tokens: PreviewToken[],
): void {
  switch (value.type) {
    case "string":
      push(tokens, JSON.stringify(value.value), "string");
      if (value.more > 0) push(tokens, "…", "punct");
      return;
    case "number":
      return push(tokens, String(value.value), "number");
    case "boolean":
      return push(tokens, String(value.value), "keyword");
    case "symbol":
    case "date":
      return push(tokens, String(value.value), "plain");
    case "null":
    case "undefined":
      return push(tokens, value.type, "nullish");
    case "bigint":
      return push(tokens, `${value.value}n`, "number");
    case "function":
      return push(tokens, `ƒ ${value.name || "anonymous"}`, "function");
    case "error":
      return push(
        tokens,
        value.message ? `${value.name}: ${value.message}` : value.name,
        "plain",
      );
    case "ref":
      return push(tokens, `[circular ${value.className}]`, "nullish");
    case "unreadable":
      return push(tokens, `<${value.reason}>`, "nullish");
    case "truncated":
      push(tokens, value.className, "type");
      return push(tokens, " {…}", "nullish");
    case "gpu":
      return push(
        tokens,
        value.label ? `${value.className} "${value.label}"` : value.className,
        "type",
      );
  }
  if (!top) return headerTokens(value, tokens);
  switch (value.type) {
    case "object": {
      if (value.className !== "Object") {
        push(tokens, value.className, "type");
        push(tokens, " ", "punct");
      }
      push(tokens, "{", "punct");
      list(tokens, value.entries, value.more, budget);
      return push(tokens, "}", "punct");
    }
    case "array":
      headerTokens(value, tokens);
      push(tokens, " [", "punct");
      list(tokens, unkeyed(value.items), value.more, budget);
      return push(tokens, "]", "punct");
    case "set":
      headerTokens(value, tokens);
      push(tokens, " {", "punct");
      list(tokens, unkeyed(value.items), value.more, budget);
      return push(tokens, "}", "punct");
    case "map": {
      headerTokens(value, tokens);
      push(tokens, " {", "punct");
      let length = 0;
      let count = 0;
      for (const [key, item] of value.entries) {
        if (length > budget) break;
        if (count > 0) push(tokens, ", ", "punct");
        const start = tokens.length;
        preview(key, false, budget, tokens);
        push(tokens, " => ", "punct");
        preview(item, false, budget, tokens);
        length += textLength(tokens, start) + 2;
        count++;
      }
      if (value.more > 0 || count < value.entries.length) {
        if (count > 0) push(tokens, ", ", "punct");
        push(tokens, "…", "punct");
      }
      return push(tokens, "}", "punct");
    }
  }
}

// builds only as much as fits in the preview, containers can hold hundreds of items
function list(
  tokens: PreviewToken[],
  items: [string | null, SerializedValue][],
  more: number,
  budget: number,
) {
  let length = 0;
  let count = 0;
  for (const [key, item] of items) {
    if (length > budget) break;
    if (count > 0) push(tokens, ", ", "punct");
    const start = tokens.length;
    if (key !== null) {
      push(tokens, key, "key");
      push(tokens, ": ", "punct");
    }
    preview(item, false, budget, tokens);
    length += textLength(tokens, start) + 2;
    count++;
  }
  if (more > 0 || count < items.length) {
    if (count > 0) push(tokens, ", ", "punct");
    push(tokens, "…", "punct");
  }
}

function headerTokens(value: SerializedValue, tokens: PreviewToken[]): void {
  switch (value.type) {
    case "object":
      return push(
        tokens,
        value.className === "Object" ? "{…}" : value.className,
        "type",
      );
    case "array":
      return push(tokens, `${value.className}(${value.length})`, "type");
    case "map":
      return push(tokens, `Map(${value.entries.length + value.more})`, "type");
    case "set":
      return push(tokens, `Set(${value.items.length + value.more})`, "type");
    default:
      return preview(value, false, 0, tokens);
  }
}

function header(value: SerializedValue) {
  const tokens: PreviewToken[] = [];
  headerTokens(value, tokens);
  return tokens.map((token) => token.text).join("");
}

function unkeyed(items: SerializedValue[]) {
  return items.map((item): [string | null, SerializedValue] => [null, item]);
}

function withMore(
  children: [string, SerializedValue][],
  more: number,
): [string, SerializedValue][] {
  return more > 0
    ? [...children, [FORMAT.moreKey, stringValue(`… ${more} more`)]]
    : children;
}

function stringValue(value: string): SerializedValue {
  return { type: "string", value, more: 0 };
}

function indentLines(text: string) {
  return text.split("\n").join(`\n${FORMAT.entryIndent}`);
}
