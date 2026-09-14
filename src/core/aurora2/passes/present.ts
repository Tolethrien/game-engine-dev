import Aurora from "../core";
import { Pass, PassContext, PassResources } from "../pass";
import shader from "../shaders/present.wgsl?raw";

export default class PresentPass extends Pass<"render"> {
  public readonly name = "present";
  public readonly type = "render";
  declare private pipeline: GPURenderPipeline;
  declare private sampler: GPUSampler;

  async setup() {
    const module = Aurora.device.createShaderModule({
      label: "presentShader",
      code: shader,
    });
    this.pipeline = await Aurora.device.createRenderPipelineAsync({
      label: "presentPipeline",
      layout: "auto",
      vertex: { module, entryPoint: "vertexMain" },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
      },
    });
    this.sampler = Aurora.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
  }

  resources(res: PassResources) {
    res.read("scene");
    res.writeCanvas({ loadOp: "clear", clearValue: [0, 0, 0, 0] });
  }

  execute(encoder: GPURenderPassEncoder, ctx: PassContext) {
    const bindGroup = Aurora.device.createBindGroup({
      label: "presentBind",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: ctx.view("scene") },
      ],
    });
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(0, bindGroup);
    encoder.draw(3);
  }
}
