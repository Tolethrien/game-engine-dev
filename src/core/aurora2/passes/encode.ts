import Aurora from "../core";
import { RenderPass, PassContext, PassResources, PassTargets } from "../pass";
import PassBinds, { PassBindEntries } from "../passBinds";
import shader from "../shaders/encode.wgsl?raw";

const BINDS = {
  scene: { binding: 0, type: "texture" },
} satisfies PassBindEntries;

export default class EncodePass extends RenderPass {
  public readonly name = "encode";
  declare private pipeline: GPURenderPipeline;
  declare private binds: PassBinds<typeof BINDS>;

  async setup(targets: PassTargets) {
    this.binds = new PassBinds("encode", BINDS);
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "encode",
      shader,
      binds: this.binds.layout,
      constants: { linearColors: Aurora.isLinear },
    });
  }

  resources(res: PassResources) {
    res.read("scene");
    res.create("ldr", { size: { scale: 1 }, format: "rgba8unorm" });
  }

  execute(encoder: GPURenderPassEncoder, ctx: PassContext) {
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(2, this.binds.get({ scene: ctx.view("scene") }));
    encoder.draw(6);
  }
}
