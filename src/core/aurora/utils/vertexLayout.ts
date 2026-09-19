import { assert } from "@axiom/utils";
import GrowingBuffer from "./growingBuffer";

type FormatView = "floats" | "uints" | "bytes";
interface FormatInfo {
  words: number;
  components: number;
  view: FormatView;
}

const VERTEX_FORMATS = {
  float32: { words: 1, components: 1, view: "floats" },
  float32x2: { words: 2, components: 2, view: "floats" },
  float32x3: { words: 3, components: 3, view: "floats" },
  float32x4: { words: 4, components: 4, view: "floats" },
  uint32: { words: 1, components: 1, view: "uints" },
  uint32x2: { words: 2, components: 2, view: "uints" },
  uint32x3: { words: 3, components: 3, view: "uints" },
  uint32x4: { words: 4, components: 4, view: "uints" },
  unorm8x4: { words: 1, components: 4, view: "bytes" },
} as const satisfies Record<string, FormatInfo>;
const WORD = 4;

export type VertexFormat = keyof typeof VERTEX_FORMATS;
export type VertexFields = Record<string, VertexFormat>;
export interface VertexLayoutOptions {
  stepMode?: GPUVertexStepMode;
  firstLocation?: number;
}
type FormatArgs<F extends VertexFormat> = F extends "float32" | "uint32"
  ? [number]
  : F extends "float32x2" | "uint32x2"
    ? [number, number]
    : F extends "float32x3" | "uint32x3"
      ? [number, number, number]
      : [number, number, number, number];
export type VertexWriter<T extends VertexFields> = {
  at(index: number): void;
} & { [K in keyof T]: (...values: FormatArgs<T[K]>) => void };

interface WriterState {
  base: number;
  floats: Float32Array;
  uints: Uint32Array;
  bytes: Uint8Array;
}
type NumericSetter = (a: number, b: number, c: number, d: number) => void;

// one variant per component count, chosen once at createWriter instead of
// branching on components/view on every call (hot path: 13 calls/instance)
function floatSetter(
  components: number,
  offset: number,
  state: WriterState,
): NumericSetter {
  switch (components) {
    case 1:
      return (a) => {
        state.floats[state.base + offset] = a;
      };
    case 2:
      return (a, b) => {
        const o = state.base + offset;
        state.floats[o] = a;
        state.floats[o + 1] = b;
      };
    case 3:
      return (a, b, c) => {
        const o = state.base + offset;
        state.floats[o] = a;
        state.floats[o + 1] = b;
        state.floats[o + 2] = c;
      };
    default:
      return (a, b, c, d) => {
        const o = state.base + offset;
        state.floats[o] = a;
        state.floats[o + 1] = b;
        state.floats[o + 2] = c;
        state.floats[o + 3] = d;
      };
  }
}
function uintSetter(
  components: number,
  offset: number,
  state: WriterState,
): NumericSetter {
  switch (components) {
    case 1:
      return (a) => {
        state.uints[state.base + offset] = a;
      };
    case 2:
      return (a, b) => {
        const o = state.base + offset;
        state.uints[o] = a;
        state.uints[o + 1] = b;
      };
    case 3:
      return (a, b, c) => {
        const o = state.base + offset;
        state.uints[o] = a;
        state.uints[o + 1] = b;
        state.uints[o + 2] = c;
      };
    default:
      return (a, b, c, d) => {
        const o = state.base + offset;
        state.uints[o] = a;
        state.uints[o + 1] = b;
        state.uints[o + 2] = c;
        state.uints[o + 3] = d;
      };
  }
}

export default class VertexLayout<T extends VertexFields> {
  public readonly layout: GPUVertexBufferLayout;
  public readonly stride: number;
  public readonly offsets: { [K in keyof T]: number };
  private readonly fields: T;

  constructor(
    fields: T,
    { stepMode = "vertex", firstLocation = 0 }: VertexLayoutOptions = {},
  ) {
    this.fields = fields;
    const offsets = {} as { [K in keyof T]: number };
    const attributes: GPUVertexAttribute[] = [];
    let stride = 0;
    let location = firstLocation;

    for (const name of Object.keys(fields) as (keyof T & string)[]) {
      assert(name !== "at", `Vertex field name "at" is reserved`);
      const format = fields[name];
      offsets[name] = stride;
      attributes.push({
        shaderLocation: location++,
        offset: stride * WORD,
        format,
      });
      stride += VERTEX_FORMATS[format].words;
    }

    this.stride = stride;
    this.offsets = offsets;
    this.layout = { arrayStride: stride * WORD, stepMode, attributes };
  }

  public createWriter(buffer: GrowingBuffer): VertexWriter<T> {
    assert(
      buffer.getStride === this.stride,
      `Buffer stride ${buffer.getStride} does not match vertex layout stride ${this.stride}`,
    );
    const state: WriterState = {
      base: 0,
      floats: buffer.getFloats,
      uints: buffer.getUints,
      bytes: buffer.getBytes,
    };
    const writer: Record<string, unknown> = {
      at: (index: number) => {
        state.base = index * this.stride;
        state.floats = buffer.getFloats;
        state.uints = buffer.getUints;
        state.bytes = buffer.getBytes;
      },
    };

    for (const name of Object.keys(this.fields)) {
      const { components, view } = VERTEX_FORMATS[this.fields[name]];
      const offset = this.offsets[name];

      if (view === "bytes") {
        writer[name] = (a: number, b: number, c: number, d: number) => {
          const o = (state.base + offset) * WORD;
          state.bytes[o] = a;
          state.bytes[o + 1] = b;
          state.bytes[o + 2] = c;
          state.bytes[o + 3] = d;
        };
        continue;
      }

      writer[name] =
        view === "uints"
          ? uintSetter(components, offset, state)
          : floatSetter(components, offset, state);
    }
    return writer as VertexWriter<T>;
  }
}
