import Aurora from "../core";
import { ComputePass, PassContext, PassResources } from "../pass";
import PassBinds, { PassBindEntries } from "../passBinds";
import shader from "../shaders/grayscaleCompute.wgsl?raw";

const BINDS = {
  input: { binding: 0, type: "texture" },
  output: { binding: 1, type: "storageTexture", format: "rgba16float" },
} satisfies PassBindEntries;

export default class GrayscaleComputePass extends ComputePass {
  public readonly name = "grayscaleCompute";
  declare private pipeline: GPUComputePipeline;
  declare private binds: PassBinds<typeof BINDS>;

  async setup() {
    this.binds = new PassBinds("grayscaleCompute", BINDS);
    this.pipeline = await Aurora.createComputePipeline({
      label: "grayscaleCompute",
      shader,
      binds: this.binds.layout,
    });
  }

  resources(res: PassResources) {
    res.modify("scene");
  }

  execute(encoder: GPUComputePassEncoder, ctx: PassContext) {
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(
      2,
      this.binds.get({
        input: ctx.view("scene"),
        output: ctx.output("scene"),
      }),
    );
    Aurora.dispatch(encoder, ctx.size("scene"));
  }
}
