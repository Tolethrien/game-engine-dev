import { assert } from "@/core/axiom/utils";
import GrowingBuffer from "./growingBuffer";

const VERTEX_FORMATS = {
  float32: 1,
  float32x2: 2,
  float32x3: 3,
  float32x4: 4,
  uint32: 1,
  uint32x2: 2,
  uint32x3: 3,
  uint32x4: 4,
} as const;
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
      stride += VERTEX_FORMATS[format];
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
    const state = { base: 0, floats: buffer.getFloats, uints: buffer.getUints };
    const writer: Record<string, unknown> = {
      at: (index: number) => {
        state.base = index * this.stride;
        state.floats = buffer.getFloats;
        state.uints = buffer.getUints;
      },
    };

    for (const name of Object.keys(this.fields)) {
      const format = this.fields[name];
      const offset = this.offsets[name];
      const components = VERTEX_FORMATS[format];
      const uint = format.startsWith("uint");
      writer[name] = (a: number, b: number, c: number, d: number) => {
        const view = uint ? state.uints : state.floats;
        const o = state.base + offset;
        view[o] = a;
        if (components > 1) view[o + 1] = b;
        if (components > 2) view[o + 2] = c;
        if (components > 3) view[o + 3] = d;
      };
    }
    return writer as VertexWriter<T>;
  }
}
