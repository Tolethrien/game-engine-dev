import type { SerializedValue } from "./report";

export const LOG_LIMITS = {
  depth: 6,
  itemsPerLevel: 100,
  stringLength: 10_000,
  nodes: 5000,
};

const GPU_USAGE = {
  texture: [
    "COPY_SRC",
    "COPY_DST",
    "TEXTURE_BINDING",
    "STORAGE_BINDING",
    "RENDER_ATTACHMENT",
  ],
  buffer: [
    "MAP_READ",
    "MAP_WRITE",
    "COPY_SRC",
    "COPY_DST",
    "INDEX",
    "VERTEX",
    "UNIFORM",
    "STORAGE",
    "INDIRECT",
    "QUERY_RESOLVE",
  ],
};

// state of the current serialize() call; the logger never serializes re-entrantly
const walkState = {
  nodes: 0,
  path: new Set<object>(),
};

export function serialize(value: unknown): SerializedValue {
  walkState.nodes = 0;
  walkState.path.clear();
  return walk(value, 0);
}

function walk(value: unknown, depth: number): SerializedValue {
  walkState.nodes++;
  switch (typeof value) {
    case "string":
      return value.length > LOG_LIMITS.stringLength
        ? {
            type: "string",
            value: value.slice(0, LOG_LIMITS.stringLength),
            more: value.length - LOG_LIMITS.stringLength,
          }
        : { type: "string", value, more: 0 };
    case "number":
      if (Object.is(value, -0)) return { type: "number", value: "-0" };
      return {
        type: "number",
        value: Number.isFinite(value) ? value : String(value),
      };
    case "boolean":
      return { type: "boolean", value };
    case "undefined":
      return { type: "undefined" };
    case "bigint":
      return { type: "bigint", value: value.toString() };
    case "symbol":
      return { type: "symbol", value: value.toString() };
    case "function":
      return serializeFunction(value);
  }
  if (value === null) return { type: "null" };
  // a log call must never throw into game code (proxies, exotic objects)
  try {
    return walkObject(value as object, depth);
  } catch (error) {
    return { type: "unreadable", reason: `threw: ${String(error)}` };
  }
}

function walkObject(value: object, depth: number): SerializedValue {
  const className = classNameOf(value);
  if (walkState.path.has(value)) return { type: "ref", className };
  if (isGpuObject(value, className)) return serializeGpu(value, className);
  if (value instanceof Date)
    return {
      type: "date",
      value: Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString(),
    };
  if (value instanceof Error)
    return {
      type: "error",
      name: value.name,
      message: value.message,
      stack: value.stack ?? "",
    };
  if (typeof Node !== "undefined" && value instanceof Node)
    return { type: "object", className, entries: [], more: 0 };
  if (depth >= LOG_LIMITS.depth || walkState.nodes > LOG_LIMITS.nodes)
    return { type: "truncated", className };

  walkState.path.add(value);
  try {
    return walkContainer(value, className, depth + 1);
  } finally {
    walkState.path.delete(value);
  }
}

function walkContainer(
  value: object,
  className: string,
  depth: number,
): SerializedValue {
  const limit = LOG_LIMITS.itemsPerLevel;
  if (Array.isArray(value) || isTypedArray(value)) {
    const list = value as ArrayLike<unknown>;
    const count = Math.min(list.length, limit);
    const items: SerializedValue[] = new Array(count);
    for (let index = 0; index < count; index++)
      items[index] = walk(list[index], depth);
    return {
      type: "array",
      className,
      length: list.length,
      items,
      more: list.length - count,
    };
  }
  if (value instanceof Map) {
    const entries: [SerializedValue, SerializedValue][] = [];
    for (const [key, item] of value) {
      if (entries.length >= limit) break;
      entries.push([walk(key, depth), walk(item, depth)]);
    }
    return { type: "map", entries, more: value.size - entries.length };
  }
  if (value instanceof Set) {
    const items: SerializedValue[] = [];
    for (const item of value) {
      if (items.length >= limit) break;
      items.push(walk(item, depth));
    }
    return { type: "set", items, more: value.size - items.length };
  }
  const keys = Object.keys(value);
  const count = Math.min(keys.length, limit);
  const entries: [string, SerializedValue][] = new Array(count);
  for (let index = 0; index < count; index++) {
    const key = keys[index];
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    entries[index] = [
      key,
      descriptor && "value" in descriptor
        ? walk(descriptor.value, depth)
        : { type: "unreadable", reason: "getter" },
    ];
  }
  return { type: "object", className, entries, more: keys.length - count };
}

function serializeGpu(value: object, className: string): SerializedValue {
  const info: [string, string][] = [];
  if (value instanceof GPUTexture) {
    info.push(
      ["size", `${value.width}x${value.height}x${value.depthOrArrayLayers}`],
      ["format", value.format],
      ["dimension", value.dimension],
      ["mips", String(value.mipLevelCount)],
      ["usage", usageFlags(value.usage, GPU_USAGE.texture)],
    );
  } else if (value instanceof GPUBuffer) {
    info.push(
      ["size", String(value.size)],
      ["usage", usageFlags(value.usage, GPU_USAGE.buffer)],
      ["mapState", value.mapState],
    );
  }
  const label = (value as { label?: unknown }).label;
  return {
    type: "gpu",
    className,
    label: typeof label === "string" ? label : "",
    info,
  };
}

function usageFlags(usage: number, names: string[]) {
  const flags = names.filter((_, bit) => usage & (1 << bit));
  return flags.length > 0 ? flags.join(" | ") : "0";
}

function serializeFunction(value: Function): SerializedValue {
  let source = "";
  try {
    source = dedent(Function.prototype.toString.call(value));
  } catch {
    // some host functions refuse toString, the name is still useful
  }
  const limit = LOG_LIMITS.stringLength;
  return {
    type: "function",
    name: value.name,
    source: source.slice(0, limit),
    more: Math.max(0, source.length - limit),
  };
}

// toString keeps the file indentation on every line but the first
function dedent(source: string) {
  const lines = source.split("\n");
  let indent = Infinity;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trim() === "") continue;
    indent = Math.min(indent, line.length - line.trimStart().length);
  }
  if (indent === Infinity || indent === 0) return source;
  return lines
    .map((line, index) => (index === 0 ? line : line.slice(indent)))
    .join("\n");
}

// the prefix alone would also match a game class named e.g. GPUStats
function isGpuObject(value: object, className: string) {
  if (!className.startsWith("GPU")) return false;
  const constructor = (globalThis as Record<string, unknown>)[className];
  return typeof constructor === "function" && value instanceof constructor;
}

function classNameOf(value: object) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return "null-prototype";
  const name = (prototype.constructor as { name?: unknown } | undefined)?.name;
  return typeof name === "string" && name !== "" ? name : "Object";
}

function isTypedArray(value: object) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}
