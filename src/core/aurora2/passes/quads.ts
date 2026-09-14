import Aurora from "../core";
import { Pass, PassResources } from "../pass";
import shader from "../shaders/quads.wgsl?raw";

const QUAD_STRIDE = 8; // x, y, w, h, r, g, b, a
const QUADS = new Float32Array([
  100, 100, 200, 120, 1.0, 0.2, 0.2, 1.0, 250, 180, 150, 150, 0.2, 1.0, 0.2,
  1.0, 330, 60, 120, 260, 0.2, 0.4, 1.0, 0.7,
]);

export default class QuadsPass extends Pass<"render"> {
  public readonly name = "quads";
  public readonly type = "render";
  declare private pipeline: GPURenderPipeline;
  declare private quadBuffer: GPUBuffer;
  declare private viewportBuffer: GPUBuffer;
  declare private bindGroup: GPUBindGroup;
  private viewport = new Float32Array(2);

  async setup() {
    const module = Aurora.device.createShaderModule({
      label: "quadsShader",
      code: shader,
    });
    this.pipeline = await Aurora.device.createRenderPipelineAsync({
      label: "quadsPipeline",
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: QUAD_STRIDE * Float32Array.BYTES_PER_ELEMENT,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" }, // position
              { shaderLocation: 1, offset: 8, format: "float32x2" }, // size
              { shaderLocation: 2, offset: 16, format: "float32x4" }, // color
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: "rgba16float",
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
    this.quadBuffer = Aurora.device.createBuffer({
      label: "quadsInstanceBuffer",
      size: QUADS.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.viewportBuffer = Aurora.device.createBuffer({
      label: "quadsViewportBuffer",
      size: this.viewport.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = Aurora.device.createBindGroup({
      label: "quadsBind",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.viewportBuffer } }],
    });
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
    const { width, height } = Aurora.getRenderSize;
    this.viewport[0] = width;
    this.viewport[1] = height;
    Aurora.device.queue.writeBuffer(this.viewportBuffer, 0, this.viewport);
    Aurora.device.queue.writeBuffer(this.quadBuffer, 0, QUADS);

    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(0, this.bindGroup);
    encoder.setVertexBuffer(0, this.quadBuffer);
    encoder.draw(6, QUADS.length / QUAD_STRIDE);
  }
}
