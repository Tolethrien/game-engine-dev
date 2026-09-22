import Aurora from "@aurora/core";
import {
  PassContext,
  PassResources,
  PassTargets,
  RenderPass,
} from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import screenShader from "../shaders/screenShader.wgsl?raw";

const BINDS = {
  offscreenCanvas: { binding: 0, type: "texture" },
  gui: { binding: 1, type: "texture" },
} satisfies PassBindEntries;

export default class ScreenPas extends RenderPass {
  name: string = "screenPas";
  declare private pipeline: GPURenderPipeline;
  declare private binds: PassBinds<typeof BINDS>;

  async setup(targets: PassTargets) {
    this.binds = new PassBinds("present", BINDS);
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "PresentPass",
      shader: screenShader,
      binds: this.binds.layout,
      constants: { linearColors: Aurora.isLinear },
    });
  }
  resources(res: PassResources) {
    res.read("offscreenCanvas");
    res.read("gui");
    res.sampler("linearClamp");
    res.writeCanvas({ loadOp: "clear", clearValue: [0, 0, 0, 0] });
  }
  execute(encoder: GPURenderPassEncoder, ctx: PassContext): void {
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(
      2,
      this.binds.get({
        offscreenCanvas: ctx.view("offscreenCanvas"),
        gui: ctx.view("gui"),
      }),
    );
    encoder.draw(6);
  }
}
