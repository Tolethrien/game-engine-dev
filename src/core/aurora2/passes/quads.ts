import Aurora from "../core";
import { Pass, PassResources, PassTargets } from "../pass";
import SharedBinds from "../sharedBinds";
import shader from "../shaders/quads.wgsl?raw";
import VertexLayout, { VertexFields } from "../utils/vertexLayout";
import GrowingBuffer from "../utils/growingBuffer";
import Blend from "../utils/blend";

const QUAD_FIELDS = {
  position: "float32x2",
  size: "float32x2",
  color: "float32x4",
} satisfies VertexFields;
const QUAD_VERTEX = new VertexLayout(QUAD_FIELDS, { stepMode: "instance" });
const QUADS = [
  { x: 100, y: 100, w: 200, h: 120, color: [1.0, 0.2, 0.2, 1.0] },
  { x: 250, y: 180, w: 150, h: 150, color: [0.2, 1.0, 0.2, 1.0] },
  { x: 330, y: 60, w: 120, h: 260, color: [0.2, 0.4, 1.0, 0.7] },
];

export default class QuadsPass extends Pass<"render"> {
  public readonly name = "quads";
  public readonly type = "render";
  declare private pipeline: GPURenderPipeline;
  declare private quads: GrowingBuffer;

  async setup(targets: PassTargets) {
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "quads",
      shader,
      buffers: [QUAD_VERTEX.layout],
      blend: Blend.alpha,
    });

    this.quads = new GrowingBuffer({
      label: "quadsInstanceBuffer",
      stride: QUAD_VERTEX.stride,
      usage: GPUBufferUsage.VERTEX,
      capacity: QUADS.length,
    });
    const w = QUAD_VERTEX.createWriter(this.quads);
    this.quads.begin(QUADS.length);
    QUADS.forEach((quad, i) => {
      const [r, g, b, a] = quad.color;
      w.at(i);
      w.position(quad.x, quad.y);
      w.size(quad.w, quad.h);
      w.color(r, g, b, a);
    });
    this.quads.upload();
  }

  resources(res: PassResources) {
    res.write(
      "scene",
      { size: { scale: 1 }, format: "rgba16float" },
      { loadOp: "load" },
    );
    res.write(
      "depth",
      { size: { scale: 1 }, format: "depth24plus" },
      { loadOp: "clear" },
    );
  }

  execute(encoder: GPURenderPassEncoder) {
    encoder.setPipeline(this.pipeline);
    encoder.setVertexBuffer(0, this.quads.getBuffer);
    encoder.draw(6, this.quads.getCount);
  }

  destroy() {
    this.quads.destroy();
  }
}
