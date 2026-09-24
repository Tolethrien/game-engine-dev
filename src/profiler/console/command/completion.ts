import { createSignal } from "solid-js";
import {
  completionContext,
  formatLiteral,
  isIdentifier,
  isRawCommand,
  type CompletionContext,
  type PathKey,
} from "@/core/debugger/modules/command/parse";
import type {
  CommandCompleteQuery,
  CommandCompletion,
  CommandMember,
} from "@/core/debugger/modules/command/report";
import { watchStore } from "../../watch/store";
import { commandRegistry } from "./registry";
import { watchLocks } from "./locks";

const COMPLETION = {
  membersTtlMs: 1000,
  booleans: ["true", "false"],
  indexPrefix: /^\d+$/,
  outOfRange: (length: number) => `out of range (length ${length})`,
  window: (from: number, count: number, length: number) =>
    `${from}–${from + count - 1} of ${length}`,
  skippedKeys: (count: number) => `${count} keys cannot be typed (object keys)`,
};

export type SuggestionKind =
  | "root"
  | "watch"
  | "variable"
  | "action"
  | "field"
  | "getter"
  | "method"
  | "option"
  | "index";

export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  detail: string;
  locked: boolean;
  // what accepting appends: "(" for callables, " = " for variables
  after: "none" | "call" | "assign" | "close";
}

interface CompletionState {
  open: boolean;
  items: Suggestion[];
  selected: number;
  // text range the accepted item replaces
  from: number;
  to: number;
  query: string;
  // argument position: the signature as a single, non-selectable row
  signature: string | null;
}

const CLOSED: CompletionState = {
  open: false,
  items: [],
  selected: 0,
  from: 0,
  to: 0,
  query: "",
  signature: null,
};

const [state, setState] = createSignal<CompletionState>(CLOSED);

// one round trip per query, typing further filters locally
const completionCache = new Map<
  string,
  { time: number; result: Promise<CommandCompletion | null> }
>();
let requestId = 0;

function ask(query: CommandCompleteQuery) {
  const key = JSON.stringify(query);
  const now = performance.now();
  const cached = completionCache.get(key);
  if (cached && now - cached.time < COMPLETION.membersTtlMs) return cached.result;
  const result = window.API.DEBUG.completeCommand(query);
  completionCache.set(key, { time: now, result });
  return result;
}

async function membersOf(path: PathKey[]): Promise<CommandMember[] | null> {
  const result = await ask({ kind: "members", path });
  return result?.kind === "members" ? result.members : null;
}

function indexOf(path: PathKey[], from: number) {
  return ask({ kind: "index", path, from });
}

function clearMembers() {
  completionCache.clear();
}

window.API.DEBUG.onGameReloaded(() => {
  clearMembers();
  close();
});

// inside an expression a variable is a value, not the start of an assignment
// raw JS has no variables: the game injects only roots, watches and actions there
function rootItems(expression = false, raw = false): Suggestion[] {
  const entries = commandRegistry.entries();
  const items = entries.filter((entry) => !raw || entry.kind !== "variable").map((entry): Suggestion => {
    switch (entry.kind) {
      case "root":
        return { kind: "root", label: entry.name, detail: entry.hint, locked: !entry.editable, after: "none" };
      case "variable":
        return {
          kind: "variable",
          label: entry.name,
          detail: entry.hint,
          locked: false,
          after: expression ? "none" : "assign",
        };
      case "action":
        return {
          kind: "action",
          label: entry.name,
          detail: [`(${entry.params})`, entry.hint].filter(Boolean).join("  "),
          locked: false,
          after: "call",
        };
    }
  });
  // a command with the same name wins over the watch, the game resolves it the same way
  for (const name of watchStore.names()) {
    if (entries.some((entry) => entry.name === name)) continue;
    const info = watchStore.info(name);
    items.push({
      kind: "watch",
      label: name,
      detail: info?.scope ?? "",
      locked: watchLocks.isLocked(name) || info?.editable === false,
      after: "none",
    });
  }
  return items;
}

function memberItems(members: CommandMember[]): Suggestion[] {
  return members
    .filter((member) => isIdentifier(member.name))
    .map((member) => ({
      kind: member.kind,
      label: member.name,
      detail: member.kind === "method" ? `(${member.params})` : member.preview,
      locked: false,
      after: member.kind === "method" ? "call" : "none",
    }));
}

function optionItems(options: readonly string[]): Suggestion[] {
  return options.map((option) => ({
    kind: "option",
    label: option,
    detail: "",
    locked: false,
    after: "none",
  }));
}

// typing a name (not a number or a string) can mean a root
function rootsWhileTyping(prefix: string) {
  return /^[A-Za-z_$]/.test(prefix) ? rootItems(true) : [];
}

async function valueItems(target: PathKey[]) {
  if (target.length === 1) {
    const entry = commandRegistry.find(String(target[0]));
    return entry?.kind === "variable" && entry.options ? optionItems(entry.options) : [];
  }
  const members = await membersOf(target.slice(0, -1));
  const field = members?.find((member) => member.name === target[target.length - 1]);
  return field && COMPLETION.booleans.includes(field.preview)
    ? optionItems(COMPLETION.booleans)
    : [];
}

async function signatureOf(callee: PathKey[]) {
  const name = String(callee[callee.length - 1]);
  if (callee.length === 1) {
    const entry = commandRegistry.find(name);
    return entry?.kind === "action" ? `${name}(${entry.params})` : null;
  }
  const members = await membersOf(callee.slice(0, -1));
  const method = members?.find((member) => member.name === name && member.kind === "method");
  return method ? `${name}(${method.params})` : null;
}

function filterItems(items: Suggestion[], query: string) {
  if (!query) return items;
  const needle = query.toLowerCase();
  const starts = items.filter((item) => item.label.toLowerCase().startsWith(needle));
  const contains = items.filter((item) => {
    const label = item.label.toLowerCase();
    return !label.startsWith(needle) && label.includes(needle);
  });
  return [...starts, ...contains];
}

// typing opens the list on its own only where a suggestion is likely wanted
function opensOnItsOwn(context: CompletionContext) {
  return context.kind === "index" || context.kind !== "root" || context.prefix !== "";
}

interface IndexList {
  items: Suggestion[];
  info: string | null;
  // an array window already starts at the typed number, a Map list is filtered by the prefix
  filtered: boolean;
}

async function indexList(path: PathKey[], prefix: string): Promise<IndexList> {
  const typedNumber = COMPLETION.indexPrefix.test(prefix);
  const result = await indexOf(path, typedNumber ? Number(prefix) : 0);
  if (result?.kind === "array") {
    if (prefix !== "" && !typedNumber) return { items: [], info: null, filtered: true };
    const from = prefix === "" ? 0 : Number(prefix);
    if (from >= result.length)
      return { items: [], info: COMPLETION.outOfRange(result.length), filtered: true };
    return {
      items: result.items.map((item) => ({
        kind: "index",
        label: String(item.index),
        detail: item.preview,
        locked: false,
        after: "close",
      })),
      info: COMPLETION.window(from, result.items.length, result.length),
      filtered: true,
    };
  }
  if (result?.kind === "map") {
    return {
      items: result.keys.map((entry) => ({
        kind: "index",
        label: formatLiteral(entry.key),
        detail: entry.preview,
        locked: false,
        after: "close",
      })),
      info: result.skipped > 0 ? COMPLETION.skippedKeys(result.skipped) : null,
      filtered: false,
    };
  }
  return { items: [], info: null, filtered: true };
}

async function refresh(text: string, cursor: number, manual: boolean) {
  const id = ++requestId;
  const context = completionContext(text, cursor);
  if (
    context.kind === "none" ||
    (!manual && !state().open && !opensOnItsOwn(context))
  ) {
    close();
    return;
  }

  let items: Suggestion[] = [];
  let signature: string | null = null;
  let from = cursor;
  let query = "";
  let filtered = false;
  switch (context.kind) {
    case "root":
      items = rootItems(!context.statement, isRawCommand(text));
      break;
    case "member":
      items = memberItems((await membersOf(context.parent)) ?? []);
      break;
    case "value":
      // options and true/false only fit a plain "=", "+=" and the like compute from the old value
      items = [
        ...(context.op === "=" ? await valueItems(context.target) : []),
        ...rootsWhileTyping(context.prefix),
      ];
      break;
    case "argument":
      signature = await signatureOf(context.callee);
      items = rootsWhileTyping(context.prefix);
      break;
    case "index": {
      const list = await indexList(context.path, context.prefix);
      items = list.items;
      signature = list.info;
      filtered = list.filtered;
      break;
    }
  }
  if (context.kind !== "argument" || items.length > 0) {
    from = context.from;
    query = context.prefix;
  }
  // a newer keystroke already asked for its own list
  if (id !== requestId) return;

  if (!filtered) items = filterItems(items, query);
  if (items.length === 0 && !signature) {
    close();
    return;
  }
  setState({ open: true, items, selected: 0, from, to: cursor, query, signature });
}

function close() {
  requestId++;
  if (state().open) setState(CLOSED);
}

function move(delta: number) {
  const current = state();
  const count = current.items.length;
  if (count === 0) return;
  setState({ ...current, selected: (current.selected + delta + count) % count });
}

function accept(text: string, index = state().selected) {
  const current = state();
  const item = current.items[index];
  if (!item) return null;
  const suffix =
    item.after === "call" ? "(" : item.after === "assign" ? " = " : item.after === "close" ? "]" : "";
  const insert = item.label + suffix;
  // a `]` already after the cursor is replaced, not doubled
  const to = item.after === "close" && text[current.to] === "]" ? current.to + 1 : current.to;
  close();
  return {
    text: text.slice(0, current.from) + insert + text.slice(to),
    cursor: current.from + insert.length,
    reopen: item.after === "call" || item.after === "assign",
  };
}

export const completion = {
  state,
  hasList: () => state().open && state().items.length > 0,
  refresh,
  close,
  move,
  accept,
  clearMembers,
};
