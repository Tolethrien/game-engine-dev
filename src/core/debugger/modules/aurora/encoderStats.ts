import type { Pass } from "@/core/aurora/pass";
import {
  ENCODER_FIELDS,
  ENCODER_TOTAL,
  EncoderField,
  encoderKey,
} from "./keys";
import { SeriesBuffer } from "./seriesBuffer";

type FrameCounts = Record<EncoderField, number>;

const createCounts = (): FrameCounts => ({
  draws: 0,
  instances: 0,
  vertices: 0,
  triangles: 0,
  pipelines: 0,
  steps: 0,
});

interface CategoryCounts {
  counts: FrameCounts;
  keys: Record<keyof FrameCounts, string>;
}

// wrappers are installed only while collecting, the module decides when to call watch*
export class EncoderStats {
  private topologies: WeakMap<GPURenderPipeline, GPUPrimitiveTopology> =
    new WeakMap();
  private categories: Map<string, CategoryCounts> = new Map();
  private total = this.createCategory(ENCODER_TOTAL);
  private current: FrameCounts | null = null;

  public beginPass(pass: Pass) {
    const category = pass.category;
    if (category === undefined) {
      this.current = null;
      return;
    }
    let entry = this.categories.get(category);
    if (!entry) {
      entry = this.createCategory(category);
      this.categories.set(category, entry);
    }
    this.current = entry.counts;
  }

  public watchPipeline(
    pipeline: GPURenderPipeline,
    topology: GPUPrimitiveTopology,
  ) {
    this.topologies.set(pipeline, topology);
  }

  public watchRender(encoder: GPURenderPassEncoder) {
    const counts = this.current;
    this.add(counts, "steps", 1);

    let topology: GPUPrimitiveTopology = "triangle-list";
    let lastPipeline: GPURenderPipeline | null = null;
    const setPipeline = encoder.setPipeline.bind(encoder);
    const draw = encoder.draw.bind(encoder);
    const drawIndexed = encoder.drawIndexed.bind(encoder);
    const drawIndirect = encoder.drawIndirect.bind(encoder);
    const drawIndexedIndirect = encoder.drawIndexedIndirect.bind(encoder);

    encoder.setPipeline = (pipeline) => {
      if (pipeline !== lastPipeline) {
        lastPipeline = pipeline;
        this.add(counts, "pipelines", 1);
      }
      topology = this.topologies.get(pipeline) ?? "triangle-list";
      setPipeline(pipeline);
    };
    encoder.draw = (
      vertexCount,
      instanceCount = 1,
      firstVertex,
      firstInstance,
    ) => {
      this.countDraw(counts, topology, vertexCount, instanceCount);
      draw(vertexCount, instanceCount, firstVertex, firstInstance);
    };
    encoder.drawIndexed = (
      indexCount,
      instanceCount = 1,
      firstIndex,
      baseVertex,
      firstInstance,
    ) => {
      this.countDraw(counts, topology, indexCount, instanceCount);
      drawIndexed(
        indexCount,
        instanceCount,
        firstIndex,
        baseVertex,
        firstInstance,
      );
    };
    // indirect counts live on the GPU, only the call is known
    encoder.drawIndirect = (buffer, offset) => {
      this.add(counts, "draws", 1);
      drawIndirect(buffer, offset);
    };
    encoder.drawIndexedIndirect = (buffer, offset) => {
      this.add(counts, "draws", 1);
      drawIndexedIndirect(buffer, offset);
    };
    return encoder;
  }

  public watchCompute(encoder: GPUComputePassEncoder) {
    const counts = this.current;
    this.add(counts, "steps", 1);

    let lastPipeline: GPUComputePipeline | null = null;
    const setPipeline = encoder.setPipeline.bind(encoder);
    encoder.setPipeline = (pipeline) => {
      if (pipeline !== lastPipeline) {
        lastPipeline = pipeline;
        this.add(counts, "pipelines", 1);
      }
      setPipeline(pipeline);
    };
    return encoder;
  }

  public watchClear() {
    this.add(this.current, "steps", 1);
  }

  public flush(buffer: SeriesBuffer) {
    this.categories.forEach((entry) => this.flushCategory(entry, buffer));
    this.flushCategory(this.total, buffer);
  }

  public reset() {
    this.categories.forEach((entry) => this.clear(entry.counts));
    this.clear(this.total.counts);
    this.current = null;
  }

  private flushCategory(entry: CategoryCounts, buffer: SeriesBuffer) {
    for (const field of ENCODER_FIELDS) {
      buffer.push(entry.keys[field], entry.counts[field]);
    }
    this.clear(entry.counts);
  }

  private add(
    counts: FrameCounts | null,
    field: keyof FrameCounts,
    value: number,
  ) {
    this.total.counts[field] += value;
    if (counts) counts[field] += value;
  }

  private countDraw(
    counts: FrameCounts | null,
    topology: GPUPrimitiveTopology,
    vertexCount: number,
    instanceCount: number,
  ) {
    this.add(counts, "draws", 1);
    this.add(counts, "instances", instanceCount);
    this.add(counts, "vertices", vertexCount * instanceCount);
    if (topology === "triangle-list") {
      this.add(counts, "triangles", Math.floor(vertexCount / 3) * instanceCount);
    } else if (topology === "triangle-strip") {
      this.add(counts, "triangles", Math.max(0, vertexCount - 2) * instanceCount);
    }
  }

  private createCategory(category: string): CategoryCounts {
    const counts = createCounts();
    const keys = {} as Record<keyof FrameCounts, string>;
    for (const field of ENCODER_FIELDS) keys[field] = encoderKey(category, field);
    return { counts, keys };
  }

  private clear(counts: FrameCounts) {
    for (const field of ENCODER_FIELDS) counts[field] = 0;
  }
}
