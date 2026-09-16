import { debug } from "@debug";
import Aurora, { RenderPipelineOptions } from "../../core";
import { PassResources, PassTargets, RenderPass } from "../../pass";
import Blend from "../../utils/blend";
import GrowingBuffer from "../../utils/growingBuffer";
import VertexLayout, {
  VertexFields,
  VertexWriter,
} from "../../utils/vertexLayout";
import Draw from "../draw";
import shader from "../shaders/draw.wgsl?raw";
import type { URPSortConfig } from "../urp";

const INSTANCE_FIELDS = {
  position: "float32x2",
  size: "float32x2",
  rotation: "float32",
  radius: "float32x4",
  outlineWidth: "float32",
  color: "unorm8x4",
  outlineColor: "unorm8x4",
  shape: "uint32",
  uvRect: "float32x4",
  layer: "uint32",
  sortPoint: "float32x2",
} satisfies VertexFields;
const INSTANCE_VERTEX = new VertexLayout(INSTANCE_FIELDS, {
  stepMode: "instance",
});
const STRIDE_BYTES = INSTANCE_VERTEX.stride * 4;
const SORT_Y = INSTANCE_VERTEX.offsets.sortPoint + 1;
export type DrawWriter = VertexWriter<typeof INSTANCE_FIELDS>;

export default class DrawPass extends RenderPass {
  public readonly name = "draw";
  public readonly sort: URPSortConfig;
  declare private opaquePipeline: GPURenderPipeline | null;
  declare private transparentPipeline: GPURenderPipeline;
  declare private opaque: GrowingBuffer;
  declare private transparent: GrowingBuffer;
  declare private sorted: GrowingBuffer;
  declare private opaqueWriter: DrawWriter;
  declare private transparentWriter: DrawWriter;
  private order = new Uint32Array(64);
  private readonly counters = () => ({
    bodies: this.opaque.getCount + this.transparent.getCount,
    opaque: this.opaque.getCount,
    transparent: this.transparent.getCount,
  });

  constructor(sort: URPSortConfig) {
    super();
    this.sort = sort;
  }

  private get depthSorted() {
    return this.sort.mode !== "none";
  }

  async setup(targets: PassTargets) {
    this.opaque = this.createBuffer("drawOpaque");
    this.transparent = this.createBuffer("drawTransparent");
    this.sorted = this.createBuffer("drawSorted");
    this.opaqueWriter = INSTANCE_VERTEX.createWriter(this.opaque);
    this.transparentWriter = INSTANCE_VERTEX.createWriter(this.transparent);

    const sorted = this.depthSorted;
    const options: RenderPipelineOptions = {
      label: "draw",
      shader,
      buffers: [INSTANCE_VERTEX.layout],
      blend: Blend.premultiplied,
    };
    const constants = {
      linearColors: Aurora.isLinear,
      depthSort: sorted,
      sortMargin: this.sort.margin,
    };

    [this.opaquePipeline, this.transparentPipeline] = await Promise.all([
      sorted
        ? Aurora.createRenderPipeline(targets, {
            ...options,
            label: "drawOpaque",
            depth: { write: true },
            constants: { ...constants, opaquePass: true },
          })
        : null,
      Aurora.createRenderPipeline(targets, {
        ...options,
        label: "drawTransparent",
        depth: sorted ? { write: false } : undefined,
        constants: { ...constants, opaquePass: false },
      }),
    ]);

    Draw.setTarget(this);
    debug.aurora.connectCounters("draw", this.counters);
  }

  resources(res: PassResources) {
    const color = Aurora.getSettings.rendering.canvasColor;
    const alpha = color[3] / 255;
    res.readAsset("albedo");
    res.sampler("nearestClamp");
    res.create(
      "offscreenCanvas",
      { size: { scale: 1 }, format: "rgba16float" },
      {
        clearValue: [
          Aurora.colorChannel(color[0]) * alpha,
          Aurora.colorChannel(color[1]) * alpha,
          Aurora.colorChannel(color[2]) * alpha,
          alpha,
        ],
      },
    );
    if (this.depthSorted) {
      res.create(
        "depth",
        { size: { scale: 1 }, format: "depth32float" },
        { depthClearValue: 1 },
      );
    }
  }

  /** adds one instance, the returned writer points at it until the next call */
  public instance(opaque: boolean) {
    if (opaque && this.depthSorted) {
      this.opaqueWriter.at(this.opaque.push());
      return this.opaqueWriter;
    }
    this.transparentWriter.at(this.transparent.push());
    return this.transparentWriter;
  }

  public beginFrame() {
    this.opaque.clear();
    this.transparent.clear();
  }

  execute(encoder: GPURenderPassEncoder) {
    if (this.opaquePipeline && this.opaque.getCount > 0) {
      this.opaque.upload();
      encoder.setPipeline(this.opaquePipeline);
      encoder.setVertexBuffer(0, this.opaque.getBuffer);
      encoder.draw(6, this.opaque.getCount);
    }

    if (this.transparent.getCount === 0) return;
    const buffer = this.depthSorted ? this.sortTransparent() : this.transparent;
    buffer.upload();
    encoder.setPipeline(this.transparentPipeline);
    encoder.setVertexBuffer(0, buffer.getBuffer);
    encoder.draw(6, buffer.getCount);
  }

  destroy() {
    Draw.clearTarget(this);
    debug.aurora.disconnectCounters("draw", this.counters);
    this.opaque.destroy();
    this.transparent.destroy();
    this.sorted.destroy();
  }

  // back to front, must match sortDepth in draw.wgsl
  private sortTransparent() {
    const count = this.transparent.getCount;
    if (this.order.length < count) {
      this.order = new Uint32Array(2 ** Math.ceil(Math.log2(count)));
    }
    const order = this.order.subarray(0, count);
    for (let i = 0; i < count; i++) order[i] = i;

    const stride = INSTANCE_VERTEX.stride;
    const floats = this.transparent.getFloats;
    order.sort(
      (a, b) => floats[a * stride + SORT_Y] - floats[b * stride + SORT_Y],
    );

    this.sorted.begin(count);
    const source = this.transparent.getBytes;
    const target = this.sorted.getBytes;
    for (let i = 0; i < count; i++) {
      const from = order[i] * STRIDE_BYTES;
      target.set(source.subarray(from, from + STRIDE_BYTES), i * STRIDE_BYTES);
    }
    return this.sorted;
  }

  private createBuffer(label: string) {
    return new GrowingBuffer({
      label,
      stride: INSTANCE_VERTEX.stride,
      usage: GPUBufferUsage.VERTEX,
    });
  }
}
