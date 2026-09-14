import Aurora from "../core";
import { Pass, PassContext, PassResources } from "../pass";
import shader from "../shaders/grayscale.wgsl?raw";

export default class GrayscalePass extends Pass<"render"> {
  public readonly name = "grayscale";
  public readonly type = "render";
  declare private pipeline: GPURenderPipeline;
  declare private sampler: GPUSampler;

  async setup() {
    const module = Aurora.device.createShaderModule({
      label: "grayscaleShader",
      code: shader,
    });
    this.pipeline = await Aurora.device.createRenderPipelineAsync({
      label: "grayscalePipeline",
      layout: "auto",
      vertex: { module, entryPoint: "vertexMain" },
      fragment: {
        module,
        entryPoint: "fragmentMain",
        targets: [{ format: "rgba16float" }],
      },
    });
    this.sampler = Aurora.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
  }

  resources(res: PassResources) {
    res.modify("scene");
  }

  execute(encoder: GPURenderPassEncoder, ctx: PassContext) {
    const bindGroup = Aurora.device.createBindGroup({
      label: "grayscaleBind",
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
