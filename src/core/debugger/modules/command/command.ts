import type {
  CommandOptions,
  CommandVariable,
  ExposeOptions,
  ICommandModule,
  ILogHandle,
} from "../../interfaces";
import type {
  CommandCompleteRequest,
  CommandCompletion,
  CommandEntry,
  CommandMember,
  CommandRegistryMessage,
} from "./report";
import type { DevWatch } from "../watch/watch";
import {
  formatLiteral,
  formatParseError,
  formatPath,
  parseCommand,
  type AssignOperator,
  type BinaryOperator,
  type CommandValue,
  type ParsedCommand,
  type PathKey,
  type UnaryOperator,
} from "./parse";
import { serialize } from "../log/serialize";
import { formatPreview } from "../log/format";
import AxiomMath from "@axiom/math";

const COMMAND = {
  maxMembers: 500,
  indexWindow: 100,
  maxMapKeys: 500,
  previewLength: 60,
  defaultEditable: true,
  index: /^\d+$/,
  arrowParam: /^(?:async\s+)?([\w$]+)\s*=>/,
  parenParams: /^[^(]*\(([^)]*)\)/,
  comments: /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
};

type Source =
  | { kind: "root"; value: () => unknown; editable: boolean }
  | { kind: "variable"; variable: CommandVariable<unknown> }
  | { kind: "action"; action: (...args: unknown[]) => unknown };

type CommandRecord = Source & { entry: CommandEntry };

class CommandError extends Error {}

export class DevCommand implements ICommandModule {
  private records = new Map<string, CommandRecord>();
  private queue: string[] = [];
  private warned = new Set<string>();

  constructor(
    private readonly watch: DevWatch,
    private readonly log: ILogHandle,
  ) {
    window.API.DEBUG.onCommandRun((text) => this.queue.push(text));
    // read-only, so it answers right away instead of waiting for the frame boundary
    window.API.DEBUG.onCommandComplete((request) => this.complete(request));
    window.__debugCommand = {
      roots: () => this.rawRoots(),
      report: (text, value, error) => this.report(text, value, error),
      probing: false,
    };
  }

  public expose(name: string, getter: () => unknown, options?: ExposeOptions) {
    const editable = options?.editable ?? COMMAND.defaultEditable;
    return this.register({
      kind: "root",
      value: getter,
      editable,
      entry: { kind: "root", name, hint: options?.hint ?? "", editable },
    });
  }

  public variable<Value>(name: string, definition: CommandVariable<Value>) {
    return this.register({
      kind: "variable",
      variable: definition as CommandVariable<unknown>,
      entry: {
        kind: "variable",
        name,
        hint: definition.hint ?? "",
        options: definition.options?.map(formatLiteral) ?? null,
      },
    });
  }

  public action(
    name: string,
    action: (...args: any[]) => unknown,
    options?: CommandOptions,
  ) {
    return this.register({
      kind: "action",
      action,
      entry: { kind: "action", name, hint: options?.hint ?? "", params: paramsOf(action) },
    });
  }

  // commands run between frames, never in the middle of a game update
  public endFrame() {
    if (this.queue.length === 0) return;
    const queue = this.queue;
    this.queue = [];
    for (const text of queue) this.execute(text);
  }

  private register(record: CommandRecord) {
    const name = record.entry.name;
    this.records.set(name, record);
    this.send({ type: "add", entry: record.entry });
    return () => {
      if (this.records.get(name) !== record) return;
      this.records.delete(name);
      this.send({ type: "remove", name });
    };
  }

  private send(message: CommandRegistryMessage) {
    window.API.DEBUG.sendCommandRegistry(message);
  }

  private execute(text: string) {
    const parsed = parseCommand(text);
    if (!parsed.ok) {
      this.log.error(`> ${text}`, formatParseError(text, parsed));
      return;
    }
    // a command must never take the game down
    try {
      this.run(text, parsed.command);
    } catch (error) {
      this.log.error(
        `> ${text}`,
        error instanceof CommandError ? error.message : error,
      );
    }
  }

  private run(text: string, command: ParsedCommand) {
    switch (command.kind) {
      case "expression":
        this.report(`> ${text}`, this.evaluate(command.value), false);
        return;
      case "assign":
        this.assign(text, command.target, command.op, command.value);
        return;
      case "update":
        this.update(text, command.target, command.op);
        return;
      case "raw":
        throw new CommandError("raw commands run through the main process");
    }
  }

  private source(name: string): Source {
    const record = this.records.get(name);
    const watch = this.watch.root(name);
    if (record) {
      if (watch && !this.warned.has(name)) {
        this.warned.add(name);
        this.log.warn(`"${name}" is both a command and a watch, the command wins`);
      }
      return record;
    }
    if (watch) return { kind: "root", value: watch.value, editable: watch.editable };
    throw new CommandError(`unknown name "${name}"`);
  }

  private base(source: Source) {
    switch (source.kind) {
      case "root":
        return source.value();
      case "variable":
        return source.variable.get();
      case "action":
        return source.action;
    }
  }

  private writable(source: Source, name: string) {
    if (source.kind === "variable")
      throw new CommandError(`"${name}" is a variable, set it with ${name} = value`);
    if (source.kind === "action")
      throw new CommandError(`"${name}" is an action, call it with ${name}(...)`);
    if (!source.editable)
      throw new CommandError(`"${name}" is read-only (editable: false in game code)`);
  }

  // a getter on an explicitly typed path may run, that is what the user asked for
  private step(value: unknown, walked: PathKey[], key: PathKey) {
    if (value === null || value === undefined)
      throw new CommandError(`${formatPath(walked)} is ${value}, cannot read "${key}"`);
    // a Map entry wins over a property of the same name (`size`), PathKey cannot tell them apart
    if (value instanceof Map && value.has(key)) return value.get(key);
    if (!(key in Object(value)))
      throw new CommandError(
        `${formatPath([...walked, key])}: no key "${key}" ${missingOn(value)}`,
      );
    return (value as Record<PathKey, unknown>)[key];
  }

  private walk(base: unknown, path: PathKey[], from: number, to: number) {
    let value = base;
    for (let index = from; index < to; index++)
      value = this.step(value, path.slice(0, index), path[index]);
    return value;
  }

  private read(path: PathKey[]) {
    const source = this.source(path[0] as string);
    return this.walk(this.base(source), path, 1, path.length);
  }

  private evaluate(value: CommandValue): unknown {
    switch (value.kind) {
      case "literal":
        return value.value;
      case "chain":
        return this.chain(value);
      case "array":
        return value.items.map((item) => this.evaluate(item));
      case "object":
        return Object.fromEntries(
          value.entries.map(([key, item]) => [key, this.evaluate(item)]),
        );
      case "unary":
        return applyUnary(value.op, this.evaluate(value.operand));
      case "binary":
        return this.binary(value.op, value.left, value.right);
    }
  }

  private binary(op: BinaryOperator, leftNode: CommandValue, rightNode: CommandValue) {
    const left = this.evaluate(leftNode);
    // short-circuit: the right side is not evaluated at all
    if (op === "&&") return left ? this.evaluate(rightNode) : left;
    if (op === "||") return left ? left : this.evaluate(rightNode);
    if (op === "??") return left ?? this.evaluate(rightNode);
    return applyBinary(op, left, this.evaluate(rightNode));
  }

  private chain(value: Extract<CommandValue, { kind: "chain" }>) {
    const root = value.root;
    const source = this.source(root);
    let current = this.base(source);
    // `this` of the next call: the value before the last key
    let parent: unknown = undefined;
    let walked: PathKey[] = [root];
    let keyed = false;
    let called = false;
    for (const step of value.steps) {
      if (step.kind === "key") {
        parent = current;
        current = this.step(current, walked, step.key);
        walked = [...walked, step.key];
        keyed = true;
        continue;
      }
      if (typeof current !== "function")
        throw new CommandError(`${formatPath(walked)} is not a function`);
      // a method may change state, so it needs an editable root; an action is meant to be called
      if (keyed || called || source.kind !== "action") this.writable(source, root);
      current = Reflect.apply(
        current,
        parent,
        step.args.map((arg) => this.evaluate(arg)),
      );
      parent = undefined;
      walked = [`${formatPath(walked)}()`];
      called = true;
    }
    return current;
  }

  // resolved once: the previous value and how to store the new one
  private target(path: PathKey[]) {
    const name = path[0] as string;
    const source = this.source(name);
    if (path.length === 1) {
      if (source.kind !== "variable")
        throw new CommandError(`cannot replace "${name}", assign to one of its keys`);
      const variable = source.variable;
      return {
        previous: variable.get(),
        write: (value: unknown) => {
          if (variable.options && !variable.options.some((option) => Object.is(option, value)))
            throw new CommandError(
              `${formatLiteral(value)} is not allowed for "${name}", use one of: ${variable.options.map(formatLiteral).join(", ")}`,
            );
          variable.set(value);
        },
      };
    }

    this.writable(source, name);
    const parent = this.walk(this.base(source), path, 1, path.length - 1);
    const key = path[path.length - 1];
    const parentPath = formatPath(path.slice(0, -1));
    if (parent === null || (typeof parent !== "object" && typeof parent !== "function"))
      throw new CommandError(`${parentPath} is ${typeName(parent)}, cannot assign "${key}"`);
    if (parent instanceof Map && parent.has(key)) {
      return {
        previous: parent.get(key),
        write: (value: unknown) => void parent.set(key, value),
      };
    }
    if (!(key in parent))
      throw new CommandError(`${formatPath(path)}: no key "${key}" ${missingOn(parent)}`);
    return {
      previous: (parent as Record<PathKey, unknown>)[key],
      write: (value: unknown) => {
        if (!Reflect.set(parent, key, value))
          throw new CommandError(
            `${formatPath(path)} is read-only (frozen object or getter without setter)`,
          );
      },
    };
  }

  private assign(text: string, path: PathKey[], op: AssignOperator, valueNode: CommandValue) {
    const { previous, write } = this.target(path);
    let value: unknown;
    if (op === "=") {
      value = this.evaluate(valueNode);
    } else if (op === "??=") {
      if (previous !== null && previous !== undefined) {
        this.log.log(`> ${text}`, `(unchanged, was ${previewOf(previous)})`);
        return;
      }
      value = this.evaluate(valueNode);
    } else {
      value = applyBinary(op.slice(0, -1) as BinaryOperator, previous, this.evaluate(valueNode));
    }
    write(value);
    this.reportAssign(text, previous, value, op !== "=");
  }

  private update(text: string, path: PathKey[], op: "++" | "--") {
    const { previous, write } = this.target(path);
    if (typeof previous !== "number")
      throw new CommandError(
        `${formatPath(path)} is ${typeName(previous)}, ${op} needs a number`,
      );
    const value = op === "++" ? previous + 1 : previous - 1;
    write(value);
    this.reportAssign(text, previous, value, true);
  }

  private reportAssign(text: string, previous: unknown, value: unknown, computed: boolean) {
    const was = computed
      ? `(${previewOf(previous)} → ${previewOf(value)})`
      : `(was ${previewOf(previous)})`;
    const changedType =
      previous !== null &&
      previous !== undefined &&
      value !== null &&
      value !== undefined &&
      typeof previous !== typeof value;
    if (changedType)
      this.log.warn(`> ${text}`, was, `type changed: ${typeof previous} → ${typeof value}`);
    else this.log.log(`> ${text}`, was);
  }

  private report(label: string, value: unknown, error: boolean) {
    if (error) {
      this.log.error(label, value);
      return;
    }
    if (isThenable(value)) {
      value.then(
        (resolved) => this.log.log(label, resolved),
        (rejected) => this.log.error(label, rejected),
      );
      return;
    }
    this.log.log(label, value);
  }

  private complete(request: CommandCompleteRequest) {
    const query = request.query;
    let completion: CommandCompletion | null = null;
    try {
      const value = this.read(query.path);
      completion =
        query.kind === "members"
          ? { kind: "members", members: listMembers(value) }
          : listIndex(value, query.from);
    } catch {
      completion = null;
    }
    window.API.DEBUG.sendCommandCompleteResult({ id: request.id, completion });
  }

  // lazy getters: `with` reads only the names the code actually uses
  private rawRoots() {
    const roots: Record<string, unknown> = {};
    const define = (name: string, get: () => unknown) =>
      Object.defineProperty(roots, name, { get, enumerable: true, configurable: true });
    for (const name of this.watch.names()) define(name, this.watch.root(name)!.value);
    for (const [name, record] of this.records) {
      if (record.kind === "root") define(name, record.value);
      else if (record.kind === "action") define(name, () => record.action);
    }
    return roots;
  }
}

const ARITHMETIC: Record<string, (left: any, right: any) => unknown> = {
  "-": (left, right) => left - right,
  "*": (left, right) => left * right,
  "/": (left, right) => left / right,
  "%": (left, right) => left % right,
  "**": (left, right) => left ** right,
};

const COMPARISON: Record<string, (left: any, right: any) => boolean> = {
  "<": (left, right) => left < right,
  "<=": (left, right) => left <= right,
  ">": (left, right) => left > right,
  ">=": (left, right) => left >= right,
};

function sameKind(left: unknown, right: unknown, kinds: string[]) {
  return typeof left === typeof right && kinds.includes(typeof left);
}

// checked types instead of JS coercion: a typo gives an error, not a silent NaN
function applyBinary(op: BinaryOperator, left: unknown, right: unknown): unknown {
  if (op === "===") return left === right;
  if (op === "!==") return left !== right;
  const found = `${typeName(left)} and ${typeName(right)}`;
  if (op === "+") {
    if (typeof left === "string" || typeof right === "string")
      return String(left) + String(right);
    if (sameKind(left, right, ["number", "bigint"])) return (left as number) + (right as number);
    throw new CommandError(`"+" needs two numbers or a string, got ${found}`);
  }
  if (op in COMPARISON) {
    if (!sameKind(left, right, ["number", "string"]))
      throw new CommandError(`"${op}" needs two numbers or two strings, got ${found}`);
    return COMPARISON[op](left, right);
  }
  if (!sameKind(left, right, ["number", "bigint"]))
    throw new CommandError(`"${op}" needs numbers, got ${found}`);
  return ARITHMETIC[op](left, right);
}

function applyUnary(op: UnaryOperator, value: unknown) {
  if (op === "!") return !value;
  if (typeof value !== "number")
    throw new CommandError(`"${op}" needs a number, got ${typeName(value)}`);
  return op === "-" ? -value : value;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

function typeName(value: unknown) {
  if (value === null) return "null";
  if (typeof value !== "object" && typeof value !== "function") return typeof value;
  if (Array.isArray(value)) return `Array(${value.length})`;
  return (value as object).constructor?.name || "Object";
}

function missingOn(value: unknown) {
  return value instanceof Map ? `in Map(${value.size})` : `on ${typeName(value)}`;
}

function previewOf(value: unknown) {
  if (value !== null && (typeof value === "object" || typeof value === "function"))
    return typeName(value);
  return formatPreview(serialize(value), COMMAND.previewLength);
}

function paramsOf(action: Function) {
  let source = "";
  try {
    source = Function.prototype.toString.call(action);
  } catch {
    source = "";
  }
  if (source !== "" && !source.includes("[native code]")) {
    const match = COMMAND.arrowParam.exec(source) ?? COMMAND.parenParams.exec(source);
    if (match)
      return match[1].replace(COMMAND.comments, "").replace(/\s+/g, " ").trim();
  }
  return Array.from({ length: action.length }, (_, index) => `arg${index}`).join(", ");
}

// never calls getters, listing must not have side effects
function describeMember(owner: object, name: string): CommandMember {
  const descriptor = Object.getOwnPropertyDescriptor(owner, name)!;
  if (descriptor.get || descriptor.set) {
    const access = descriptor.get && descriptor.set ? "get/set" : descriptor.get ? "get" : "set";
    return { name, kind: "getter", preview: access, params: "" };
  }
  if (typeof descriptor.value === "function")
    return { name, kind: "method", preview: "", params: paramsOf(descriptor.value) };
  return { name, kind: "field", preview: previewOf(descriptor.value), params: "" };
}

function listMembers(value: unknown): CommandMember[] {
  if (value === null || value === undefined) return [];
  const indexed = Array.isArray(value) || ArrayBuffer.isView(value);
  const collection = value instanceof Map || value instanceof Set;
  const seen = new Set<string>();
  const members: CommandMember[] = [];
  for (
    let owner: object | null = Object(value);
    owner && owner !== Object.prototype;
    owner = Object.getPrototypeOf(owner)
  ) {
    for (const name of Object.getOwnPropertyNames(owner)) {
      if (name === "constructor" || seen.has(name)) continue;
      seen.add(name);
      if (indexed && COMMAND.index.test(name)) continue;
      const member = describeMember(owner, name);
      if (collection && member.kind !== "method") continue;
      members.push(member);
      if (members.length >= COMMAND.maxMembers) return members;
    }
  }
  return members;
}

function listIndex(value: unknown, from: number): CommandCompletion | null {
  if (value instanceof Map) {
    const keys: { key: string | number; preview: string }[] = [];
    let skipped = 0;
    for (const [key, entry] of value) {
      if (typeof key !== "string" && typeof key !== "number") skipped++;
      else if (keys.length < COMMAND.maxMapKeys) keys.push({ key, preview: previewOf(entry) });
    }
    return { kind: "map", size: value.size, skipped, keys };
  }
  const indexed = Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
  if (!indexed) return null;
  const list = value as ArrayLike<unknown>;
  const start = AxiomMath.clamp(Math.floor(from), 0, list.length);
  const end = Math.min(start + COMMAND.indexWindow, list.length);
  const items: { index: number; preview: string }[] = [];
  for (let index = start; index < end; index++)
    items.push({ index, preview: previewOf(list[index]) });
  return { kind: "array", length: list.length, from: start, items };
}

const noop = () => {};
export const prodCommand: ICommandModule = {
  expose: () => noop,
  variable: () => noop,
  action: () => noop,
  endFrame: noop,
};
