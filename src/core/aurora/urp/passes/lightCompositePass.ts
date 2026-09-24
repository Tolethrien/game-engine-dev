import {
  PassContext,
  PassResources,
  PassTargets,
  RenderPass,
} from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import FullScreenQuad from "@aurora/utils/fullScreenQuad/fullScreen";
import lightCompositeShader from "../shaders/lightCompositeShader.wgsl?raw";

const COMPOSITE_BINDS = {
  scene: { binding: 0, type: "texture" },
  lightMap: { binding: 1, type: "texture" },
  emissive: { binding: 2, type: "texture" },
} satisfies PassBindEntries;

export default class LightCompositePass extends RenderPass {
  name = "LightCompositePass";
  category = "world";
  declare private pipeline: GPURenderPipeline;
  declare private binds: PassBinds<typeof COMPOSITE_BINDS>;

  async setup(targets: PassTargets) {
    this.binds = new PassBinds("lightComposite", COMPOSITE_BINDS);
    this.pipeline = await FullScreenQuad.createPipeline(targets, {
      label: "LightCompositePass",
      shader: lightCompositeShader,
      binds: this.binds.layout,
    });
  }
  resources(res: PassResources) {
    res.read("lightMap");
    res.read("emissive");
    res.modify("offscreenCanvas", { clear: false });
  }
  execute(encoder: GPURenderPassEncoder, ctx: PassContext) {
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(
      2,
      this.binds.get({
        scene: ctx.view("offscreenCanvas"),
        lightMap: ctx.view("lightMap"),
        emissive: ctx.view("emissive"),
      }),
    );
    FullScreenQuad.draw(encoder);
  }
}
