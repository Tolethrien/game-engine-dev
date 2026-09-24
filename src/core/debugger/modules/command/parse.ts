// Shared by the game (execution) and the profiler (completion, locks): no DOM, no Node.

export type PathKey = string | number;

export type CommandLiteral = string | number | boolean | null | undefined;

export type UnaryOperator = "-" | "+" | "!";

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "<"
  | "<="
  | ">"
  | ">="
  | "==="
  | "!=="
  | "&&"
  | "||"
  | "??";

export type AssignOperator = "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "**=" | "??=";

export type UpdateOperator = "++" | "--";

export type ChainStep =
  | { kind: "key"; key: PathKey }
  | { kind: "call"; args: CommandValue[] };

export type CommandValue =
  | { kind: "literal"; value: CommandLiteral }
  | { kind: "chain"; root: string; steps: ChainStep[] }
  | { kind: "array"; items: CommandValue[] }
  | { kind: "object"; entries: [string, CommandValue][] }
  | { kind: "unary"; op: UnaryOperator; operand: CommandValue }
  | { kind: "binary"; op: BinaryOperator; left: CommandValue; right: CommandValue };

export type ParsedCommand =
  | { kind: "expression"; value: CommandValue }
  | { kind: "assign"; target: PathKey[]; op: AssignOperator; value: CommandValue }
  | { kind: "update"; target: PathKey[]; op: UpdateOperator }
  | { kind: "raw"; code: string };

export type ParseResult =
  | { ok: true; command: ParsedCommand }
  | { ok: false; message: string; position: number };

export type CompletionContext =
  // statement: the start of the command, otherwise the middle of an expression
  | { kind: "root"; prefix: string; from: number; statement: boolean }
  | { kind: "member"; parent: PathKey[]; prefix: string; from: number }
  | { kind: "value"; target: PathKey[]; op: AssignOperator; prefix: string; from: number }
  | { kind: "argument"; callee: PathKey[]; index: number; prefix: string; from: number }
  // prefix is the raw token, quotes included, also an unterminated string
  | { kind: "index"; path: PathKey[]; prefix: string; from: number }
  | { kind: "none" };

interface Token {
  type: "ident" | "number" | "string" | "punct" | "invalid" | "end";
  text: string;
  start: number;
  end: number;
  value: CommandLiteral;
  // string without its closing quote, only while typing
  open: boolean;
}

const SYNTAX = {
  rawPrefix: ">",
  // longest first, so "**=" is never read as "**" and "="
  operators: [
    "**=", "??=", "===", "!==",
    "**", "++", "--", "+=", "-=", "*=", "/=", "%=", "&&", "||", "??", "==", "!=", "<=", ">=",
  ],
  punct: ".[](){}=,:-+*/%<>!",
  identifier: /[A-Za-z_$][\w$]*/y,
  number: /(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/y,
  whitespace: /\s+/y,
  escapes: { n: "\n", t: "\t", r: "\r", "0": "\0" } as Record<string, string>,
  // a raw tail starting with one of these is not a path we can resolve
  rawKeywords: [
    "const", "let", "var", "return", "new", "typeof", "void", "delete", "await", "yield",
    "async", "function", "class", "if", "else", "for", "while", "do", "switch", "case",
    "throw", "try", "catch", "finally", "in", "of", "instanceof", "this", "super",
  ],
  keywords: {
    true: true,
    false: false,
    null: null,
    undefined: undefined,
    NaN: NaN,
    Infinity: Infinity,
  } as Record<string, CommandLiteral>,
};

export function isRawCommand(text: string) {
  return text.trimStart().startsWith(SYNTAX.rawPrefix);
}

export function isIdentifier(name: string) {
  return new RegExp(`^${SYNTAX.identifier.source}$`).test(name);
}

export function formatPath(path: readonly PathKey[]) {
  return path
    .map((key, index) => {
      if (index === 0) return String(key);
      if (typeof key === "number") return `[${key}]`;
      return isIdentifier(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    })
    .join("");
}

// the text a value would be typed as in a command
export function formatLiteral(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function formatParseError(
  text: string,
  failure: { message: string; position: number },
) {
  return `${failure.message}\n${text}\n${" ".repeat(failure.position)}^`;
}

function matchAt(pattern: RegExp, text: string, index: number) {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0] ?? null;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const push = (
    type: Token["type"],
    start: number,
    end: number,
    value: CommandLiteral = undefined,
    open = false,
  ) => tokens.push({ type, text: text.slice(start, end), start, end, value, open });

  let index = 0;
  while (index < text.length) {
    const space = matchAt(SYNTAX.whitespace, text, index);
    if (space) {
      index += space.length;
      continue;
    }
    const char = text[index];
    const identifier = matchAt(SYNTAX.identifier, text, index);
    if (identifier) {
      push("ident", index, index + identifier.length);
      index += identifier.length;
      continue;
    }
    const number = matchAt(SYNTAX.number, text, index);
    if (number) {
      push("number", index, index + number.length, Number(number));
      index += number.length;
      continue;
    }
    if (char === '"' || char === "'") {
      const start = index;
      let value = "";
      let closed = false;
      index++;
      while (index < text.length) {
        const current = text[index];
        if (current === char) {
          closed = true;
          index++;
          break;
        }
        if (current === "\\" && index + 1 < text.length) {
          const escaped = text[index + 1];
          value += SYNTAX.escapes[escaped] ?? escaped;
          index += 2;
          continue;
        }
        value += current;
        index++;
      }
      push("string", start, index, value, !closed);
      continue;
    }
    const operator = SYNTAX.operators.find((candidate) => text.startsWith(candidate, index));
    if (operator) {
      push("punct", index, index + operator.length);
      index += operator.length;
      continue;
    }
    push(SYNTAX.punct.includes(char) ? "punct" : "invalid", index, index + 1);
    index++;
  }
  push("end", text.length, text.length);
  return tokens;
}

class ParseError {
  constructor(
    public readonly message: string,
    public readonly position: number,
  ) {}
}

// weakest first; "**" is the only right associative one
const OPERATORS: Record<BinaryOperator, { precedence: number; right?: boolean }> = {
  "??": { precedence: 1 },
  "||": { precedence: 2 },
  "&&": { precedence: 3 },
  "===": { precedence: 4 },
  "!==": { precedence: 4 },
  "<": { precedence: 5 },
  "<=": { precedence: 5 },
  ">": { precedence: 5 },
  ">=": { precedence: 5 },
  "+": { precedence: 6 },
  "-": { precedence: 6 },
  "*": { precedence: 7 },
  "/": { precedence: 7 },
  "%": { precedence: 7 },
  "**": { precedence: 8, right: true },
};

// "==" and "!=" behave as the strict ones
const OPERATOR_ALIASES: Record<string, BinaryOperator> = { "==": "===", "!=": "!==" };

const ASSIGN_OPERATORS: readonly string[] = ["=", "+=", "-=", "*=", "/=", "%=", "**=", "??="];
const UPDATE_OPERATORS: readonly string[] = ["++", "--"];
const UNARY_OPERATORS: readonly string[] = ["-", "+", "!"];

function binaryOperator(text: string): BinaryOperator | null {
  const operator = OPERATOR_ALIASES[text] ?? text;
  return Object.hasOwn(OPERATORS, operator) ? (operator as BinaryOperator) : null;
}

// the path a value stands for, or null when it is not a plain chain of keys
function purePath(value: CommandValue): PathKey[] | null {
  if (value.kind !== "chain") return null;
  const path: PathKey[] = [value.root];
  for (const step of value.steps) {
    if (step.kind === "call") return null;
    path.push(step.key);
  }
  return path;
}

class Parser {
  private index = 0;
  // parenthesized nodes may mix "??" with "&&" / "||"
  private readonly grouped = new WeakSet<CommandValue>();

  constructor(private readonly tokens: Token[]) {}

  public command(): ParsedCommand {
    const value = this.expression(0);
    const token = this.current;
    const isAssign = token.type === "punct" && ASSIGN_OPERATORS.includes(token.text);
    const isUpdate = token.type === "punct" && UPDATE_OPERATORS.includes(token.text);
    if (!isAssign && !isUpdate) {
      this.end();
      return { kind: "expression", value };
    }
    const target = purePath(value);
    if (!target)
      throw new ParseError(
        value.kind === "chain"
          ? "cannot assign to a call result"
          : "cannot assign to an expression",
        token.start,
      );
    this.advance();
    if (isUpdate) {
      this.end();
      return { kind: "update", target, op: token.text as UpdateOperator };
    }
    const assigned = this.expression(0);
    this.end();
    return { kind: "assign", target, op: token.text as AssignOperator, value: assigned };
  }

  private get current() {
    return this.tokens[this.index];
  }

  private advance() {
    const token = this.current;
    if (token.type !== "end") this.index++;
    return token;
  }

  private isPunct(text: string) {
    return this.current.type === "punct" && this.current.text === text;
  }

  private accept(text: string) {
    if (!this.isPunct(text)) return false;
    this.advance();
    return true;
  }

  private expect(text: string) {
    if (!this.accept(text)) this.fail(`expected "${text}"`);
  }

  private end() {
    if (this.current.type !== "end") this.fail("expected end of command");
  }

  private fail(expected: string): never {
    const token = this.current;
    if (token.type === "string" && token.open)
      throw new ParseError("unterminated string", token.start);
    if (token.type === "invalid")
      throw new ParseError(`unexpected character "${token.text}"`, token.start);
    const found =
      token.type === "end" ? "end of input" : `"${token.text}"`;
    throw new ParseError(`${expected}, found ${found}`, token.start);
  }

  private chain(): CommandValue {
    const root = this.advance().text;
    const steps: ChainStep[] = [];
    for (;;) {
      if (this.accept(".")) {
        if (this.current.type !== "ident") this.fail('expected a name after "."');
        steps.push({ kind: "key", key: this.advance().text });
      } else if (this.accept("[")) {
        const token = this.current;
        if (token.type === "number") steps.push({ kind: "key", key: token.value as number });
        else if (token.type === "string" && !token.open)
          steps.push({ kind: "key", key: token.value as string });
        else this.fail("expected a number or a string key");
        this.advance();
        this.expect("]");
      } else if (this.accept("(")) {
        steps.push({ kind: "call", args: this.list(")", () => this.expression(0)) });
      } else return { kind: "chain", root, steps };
    }
  }

  private list<Item>(close: string, item: () => Item): Item[] {
    const items: Item[] = [];
    while (!this.accept(close)) {
      items.push(item());
      if (!this.accept(",")) {
        this.expect(close);
        break;
      }
    }
    return items;
  }

  private expression(minPrecedence: number): CommandValue {
    let left = this.unary();
    for (;;) {
      const token = this.current;
      const op = token.type === "punct" ? binaryOperator(token.text) : null;
      if (!op || OPERATORS[op].precedence < minPrecedence) return left;
      this.advance();
      const { precedence, right: rightAssociative } = OPERATORS[op];
      const right = this.expression(rightAssociative ? precedence : precedence + 1);
      this.checkMixing(op, left, right, token.start);
      left = { kind: "binary", op, left, right };
    }
  }

  // same rule as JS: "??" next to "&&" / "||" needs parentheses
  private checkMixing(op: BinaryOperator, left: CommandValue, right: CommandValue, position: number) {
    const logical = (operator: string) => operator === "&&" || operator === "||";
    const mixes = (other: CommandValue) =>
      other.kind === "binary" &&
      !this.grouped.has(other) &&
      (op === "??" ? logical(other.op) : logical(op) && other.op === "??");
    if ((op === "??" || logical(op)) && (mixes(left) || mixes(right)))
      throw new ParseError('"??" cannot be mixed with "&&" or "||", wrap in parentheses', position);
  }

  private unary(): CommandValue {
    const token = this.current;
    if (token.type === "punct" && UNARY_OPERATORS.includes(token.text)) {
      this.advance();
      const operand = this.unary();
      const next = this.current;
      // JS forbids an unparenthesized unary operand of "**"
      if (next.type === "punct" && next.text === "**")
        throw new ParseError('unary operator before "**", wrap in parentheses', next.start);
      return { kind: "unary", op: token.text as UnaryOperator, operand };
    }
    if (token.type === "punct" && UPDATE_OPERATORS.includes(token.text))
      this.fail(`"${token.text}" only works after a path, like hp${token.text}`);
    return this.primary();
  }

  private primary(): CommandValue {
    const token = this.current;
    if (token.type === "number") {
      this.advance();
      return { kind: "literal", value: token.value };
    }
    if (token.type === "string" && !token.open) {
      this.advance();
      return { kind: "literal", value: token.value };
    }
    if (token.type === "ident") {
      if (Object.hasOwn(SYNTAX.keywords, token.text)) {
        this.advance();
        return { kind: "literal", value: SYNTAX.keywords[token.text] };
      }
      return this.chain();
    }
    if (this.accept("(")) {
      const inner = this.expression(0);
      this.expect(")");
      this.grouped.add(inner);
      return inner;
    }
    if (this.accept("["))
      return { kind: "array", items: this.list("]", () => this.expression(0)) };
    if (this.accept("{"))
      return { kind: "object", entries: this.list("}", () => this.entry()) };
    this.fail("expected a value");
  }

  private entry(): [string, CommandValue] {
    const token = this.current;
    if (
      token.type !== "ident" &&
      token.type !== "number" &&
      !(token.type === "string" && !token.open)
    )
      this.fail("expected a key");
    this.advance();
    const key = token.type === "ident" ? token.text : String(token.value);
    this.expect(":");
    return [key, this.expression(0)];
  }
}

export function parseCommand(text: string): ParseResult {
  if (isRawCommand(text)) {
    const code = text.trimStart().slice(SYNTAX.rawPrefix.length).trim();
    return { ok: true, command: { kind: "raw", code } };
  }
  try {
    return { ok: true, command: new Parser(tokenize(text)).command() };
  } catch (error) {
    if (error instanceof ParseError)
      return { ok: false, message: error.message, position: error.position };
    throw error;
  }
}

// names of roots that a command calls something on, reads alone are not counted
export function callRoots(command: ParsedCommand): string[] {
  const roots = new Set<string>();
  const visit = (value: CommandValue) => {
    switch (value.kind) {
      case "chain":
        for (const step of value.steps) {
          if (step.kind !== "call") continue;
          roots.add(value.root);
          step.args.forEach(visit);
        }
        break;
      case "array":
        value.items.forEach(visit);
        break;
      case "object":
        value.entries.forEach(([, item]) => visit(item));
        break;
      case "unary":
        visit(value.operand);
        break;
      case "binary":
        visit(value.left);
        visit(value.right);
        break;
    }
  };
  if (command.kind === "expression" || command.kind === "assign") visit(command.value);
  return [...roots];
}

type Frame =
  | { kind: "call"; callee: PathKey[] | null; index: number }
  | { kind: "index"; path: PathKey[] }
  | { kind: "array" }
  | { kind: "object" };

const EXPRESSION_START: readonly string[] = [
  "+", "-", "*", "/", "%", "**", "<", "<=", ">", ">=", "===", "!==", "==", "!=", "&&", "||", "??", "!",
];

// works on unfinished text: only what is left of the cursor matters
export function completionContext(text: string, cursor: number): CompletionContext {
  const head = text.slice(0, cursor);
  if (isRawCommand(head)) return rawCompletionContext(head, cursor);
  const tokens = tokenize(head);
  tokens.pop();

  let prefixToken: Token | null = null;
  const last = tokens.at(-1);
  if (
    last &&
    last.end === cursor &&
    (last.type === "ident" || last.type === "number" || last.type === "string")
  )
    prefixToken = tokens.pop()!;
  const prefix = prefixToken?.text ?? "";
  const from = prefixToken?.start ?? cursor;
  const namePrefix = !prefixToken || prefixToken.type === "ident";

  const frames: Frame[] = [];
  let path: PathKey[] | null = null;
  let target: PathKey[] | null = null;
  let targetOp: AssignOperator = "=";
  let literal: CommandLiteral = undefined;
  let afterDot = false;
  // a "." after a call result: the type is unknown without running the code
  let unknownDot = false;

  for (const token of tokens) {
    const wasAfterDot: boolean = afterDot;
    const wasUnknownDot: boolean = unknownDot;
    afterDot = false;
    unknownDot = false;
    if (token.type === "ident") {
      if (wasAfterDot && path) path = [...path, token.text];
      else path = wasUnknownDot ? null : [token.text];
      continue;
    }
    if (token.type === "number" || token.type === "string") {
      literal = token.value;
      path = null;
      continue;
    }
    if (token.type !== "punct") return { kind: "none" };
    if (ASSIGN_OPERATORS.includes(token.text)) {
      if (frames.length === 0) {
        target = path;
        targetOp = token.text as AssignOperator;
      }
      path = null;
      continue;
    }
    switch (token.text) {
      case ".":
        afterDot = path !== null;
        unknownDot = path === null;
        break;
      case "[":
        frames.push(path ? { kind: "index", path } : { kind: "array" });
        path = null;
        break;
      case "]": {
        const frame = frames.pop();
        path =
          frame?.kind === "index" &&
          (typeof literal === "string" || typeof literal === "number")
            ? [...frame.path, literal]
            : null;
        break;
      }
      case "(":
        frames.push({ kind: "call", callee: path, index: 0 });
        path = null;
        break;
      case "{":
        frames.push({ kind: "object" });
        path = null;
        break;
      case ")":
      case "}":
        frames.pop();
        path = null;
        break;
      case ",": {
        const frame = frames.at(-1);
        if (frame?.kind === "call") frame.index++;
        path = null;
        break;
      }
      default:
        path = null;
    }
  }

  const previous = tokens.at(-1);
  const root = { kind: "root", prefix, from, statement: !previous } as const;
  if (!previous) return namePrefix ? root : { kind: "none" };
  if (afterDot && path)
    return namePrefix
      ? { kind: "member", parent: path, prefix, from }
      : { kind: "none" };
  if (previous.type !== "punct") return { kind: "none" };
  const frame = frames.at(-1);
  if (previous.text === "[" && frame?.kind === "index" && (!prefixToken || !namePrefix))
    return { kind: "index", path: frame.path, prefix, from };
  if (ASSIGN_OPERATORS.includes(previous.text) && frames.length === 0 && target)
    return { kind: "value", target, op: targetOp, prefix, from };
  if (
    frame?.kind === "call" &&
    frame.callee &&
    (previous.text === "(" || previous.text === ",")
  )
    return { kind: "argument", callee: frame.callee, index: frame.index, prefix, from };
  // where a new expression starts: after an operator, a grouping "(", or an item / value separator
  const startsExpression =
    EXPRESSION_START.includes(previous.text) ||
    (previous.text === "(" && frame?.kind === "call" && !frame.callee) ||
    (previous.text === "[" && frame?.kind === "array") ||
    (previous.text === "," && frame?.kind === "array") ||
    (previous.text === "," && frame?.kind === "call" && !frame.callee) ||
    (previous.text === ":" && frame?.kind === "object");
  if (startsExpression) return namePrefix ? root : { kind: "none" };
  return { kind: "none" };
}

// the path written right before the end of `tokens`, null when it starts with something unknown
function tailPath(tokens: Token[]): PathKey[] | null {
  const keys: PathKey[] = [];
  let index = tokens.length - 1;
  while (index >= 0) {
    const token = tokens[index];
    if (token.type === "ident") {
      keys.unshift(token.text);
      const before = tokens[index - 1];
      if (!before || before.type !== "punct" || before.text !== ".") {
        return SYNTAX.rawKeywords.includes(token.text) ? null : keys;
      }
      index -= 2;
      continue;
    }
    if (token.type === "punct" && token.text === "]") {
      const literal = tokens[index - 1];
      const open = tokens[index - 2];
      if (
        !literal ||
        literal.open ||
        (literal.type !== "number" && literal.type !== "string") ||
        open?.type !== "punct" ||
        open.text !== "["
      )
        return null;
      keys.unshift(literal.value as PathKey);
      index -= 3;
      // the thing being indexed follows directly, without a dot
      const owner = tokens[index];
      if (!owner || (owner.type !== "ident" && !(owner.type === "punct" && owner.text === "]")))
        return null;
      continue;
    }
    return null;
  }
  return null;
}

// raw JS is not parsed: only the path-looking tail before the cursor gets suggestions
function rawCompletionContext(head: string, cursor: number): CompletionContext {
  const tokens = tokenize(head.replace(SYNTAX.rawPrefix, " "));
  tokens.pop();
  let prefixToken: Token | null = null;
  const last = tokens.at(-1);
  if (
    last &&
    last.end === cursor &&
    (last.type === "ident" || last.type === "number" || last.type === "string")
  )
    prefixToken = tokens.pop()!;
  const prefix = prefixToken?.text ?? "";
  const from = prefixToken?.start ?? cursor;
  const namePrefix = !prefixToken || prefixToken.type === "ident";

  const previous = tokens.at(-1);
  if (previous?.type === "punct" && previous.text === ".") {
    const parent = namePrefix ? tailPath(tokens.slice(0, -1)) : null;
    return parent ? { kind: "member", parent, prefix, from } : { kind: "none" };
  }
  if (previous?.type === "punct" && previous.text === "[") {
    if (prefixToken && namePrefix) return { kind: "none" };
    const path = tailPath(tokens.slice(0, -1));
    return path ? { kind: "index", path, prefix, from } : { kind: "none" };
  }
  if (!namePrefix) return { kind: "none" };
  if (previous && previous.type !== "punct" && previous.type !== "invalid") return { kind: "none" };
  if (previous?.type === "punct" && CLOSERS.includes(previous.text)) return { kind: "none" };
  return { kind: "root", prefix, from, statement: false };
}

const CLOSERS: readonly string[] = [")", "]", "}"];
