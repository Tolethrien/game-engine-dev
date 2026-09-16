import Aurora from "../../core";
import {
  RenderPass,
  PassContext,
  PassResources,
  PassTargets,
} from "../../pass";
import PassBinds, { PassBindEntries } from "../../passBinds";
import shader from "../shaders/present.wgsl?raw";

const BINDS = {
  offscreenCanvas: { binding: 0, type: "texture" },
} satisfies PassBindEntries;

export default class PresentPass extends RenderPass {
  public readonly name = "present";
  declare private pipeline: GPURenderPipeline;
  declare private binds: PassBinds<typeof BINDS>;

  async setup(targets: PassTargets) {
    this.binds = new PassBinds("present", BINDS);
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "present",
      shader,
      binds: this.binds.layout,
      constants: { linearColors: Aurora.isLinear },
    });
  }

  resources(res: PassResources) {
    res.read("offscreenCanvas");
    res.sampler("linearClamp");
    res.writeCanvas({ loadOp: "clear", clearValue: [0, 0, 0, 0] });
  }

  execute(encoder: GPURenderPassEncoder, ctx: PassContext) {
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(
      2,
      this.binds.get({ offscreenCanvas: ctx.view("offscreenCanvas") }),
    );
    encoder.draw(6);
  }
}
