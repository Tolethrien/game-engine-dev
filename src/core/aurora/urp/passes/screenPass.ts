import Aurora from "@aurora/core";
import {
  PassContext,
  PassResources,
  PassTargets,
  RenderPass,
} from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import FixedBuffer from "@aurora/utils/fixedBuffer";
import { AuroraUsage } from "@aurora/utils/usage";
import screenShader from "../shaders/screenShader.wgsl?raw";

const BINDS = {
  offscreenCanvas: { binding: 0, type: "texture" },
  gui: { binding: 1, type: "texture" },
  params: { binding: 2, type: "uniform" },
} satisfies PassBindEntries;

export default class ScreenPas extends RenderPass {
  name: string = "screenPas";
  declare private pipeline: GPURenderPipeline;
  declare private binds: PassBinds<typeof BINDS>;
  declare private uniform: FixedBuffer;
  private writtenGamma = NaN;

  async setup(targets: PassTargets) {
    this.binds = new PassBinds("present", BINDS);
    // mirrors struct Screen in screenShader.wgsl
    this.uniform = new FixedBuffer({
      label: "screenPass",
      words: 4,
      usage: AuroraUsage.uniform,
    });
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "PresentPass",
      shader: screenShader,
      binds: this.binds.layout,
      constants: { linearColors: Aurora.isLinear },
    });
  }
  destroy() {
    this.uniform.destroy();
  }
  resources(res: PassResources) {
    res.read("offscreenCanvas");
    res.read("gui");
    res.sampler("linearClamp");
    res.writeCanvas({ loadOp: "clear", clearValue: [0, 0, 0, 0] });
  }
  execute(encoder: GPURenderPassEncoder, ctx: PassContext): void {
    this.writeParams();
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(
      2,
      this.binds.get({
        offscreenCanvas: ctx.view("offscreenCanvas"),
        gui: ctx.view("gui"),
        params: this.uniform.getBuffer,
      }),
    );
    encoder.draw(6);
  }
  // read every frame, so Aurora.setParameter({ rendering: { gamma } }) needs no rebuild
  private writeParams() {
    const gamma = Aurora.getSettings.rendering.gamma;
    if (gamma === this.writtenGamma) return;
    this.writtenGamma = gamma;
    this.uniform.floats[0] = 1 / gamma;
    this.uniform.upload();
  }
}
