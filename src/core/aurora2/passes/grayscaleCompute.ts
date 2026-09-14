import Aurora from "../core";
import { Pass, PassContext, PassResources } from "../pass";
import shader from "../shaders/grayscaleCompute.wgsl?raw";

const WORKGROUP_SIZE = 8;

export default class GrayscaleComputePass extends Pass<"compute"> {
  public readonly name = "grayscaleCompute";
  public readonly type = "compute";
  declare private pipeline: GPUComputePipeline;

  async setup() {
    const module = Aurora.device.createShaderModule({
      label: "grayscaleComputeShader",
      code: shader,
    });
    this.pipeline = await Aurora.device.createComputePipelineAsync({
      label: "grayscaleComputePipeline",
      layout: "auto",
      compute: { module, entryPoint: "computeMain" },
    });
  }

  resources(res: PassResources) {
    res.modify("scene");
  }

  execute(encoder: GPUComputePassEncoder, ctx: PassContext) {
    const bindGroup = Aurora.device.createBindGroup({
      label: "grayscaleComputeBind",
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: ctx.view("scene") },
        { binding: 1, resource: ctx.output("scene") },
      ],
    });
    const { width, height } = Aurora.getRenderSize;
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(0, bindGroup);
    encoder.dispatchWorkgroups(
      Math.ceil(width / WORKGROUP_SIZE),
      Math.ceil(height / WORKGROUP_SIZE),
    );
  }
}
