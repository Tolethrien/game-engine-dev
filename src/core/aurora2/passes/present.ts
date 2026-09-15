import Aurora from "../core";
import { Pass, PassContext, PassResources, PassTargets } from "../pass";
import PassBinds, { PassBindEntries } from "../passBinds";
import SharedBinds from "../sharedBinds";
import shader from "../shaders/present.wgsl?raw";

const BINDS = {
  scene: { binding: 0, type: "texture" },
} satisfies PassBindEntries;

export default class PresentPass extends Pass<"render"> {
  public readonly name = "present";
  public readonly type = "render";
  declare private pipeline: GPURenderPipeline;
  declare private binds: PassBinds<typeof BINDS>;

  async setup(targets: PassTargets) {
    this.binds = new PassBinds("present", BINDS);
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "present",
      shader,
      binds: this.binds.layout,
    });
  }

  resources(res: PassResources) {
    res.read("scene");
    res.sampler("linearClamp");
    res.writeCanvas({ loadOp: "clear", clearValue: [0, 0, 0, 0] });
  }

  execute(encoder: GPURenderPassEncoder, ctx: PassContext) {
    encoder.setPipeline(this.pipeline);
    encoder.setBindGroup(2, this.binds.get({ scene: ctx.view("scene") }));
    encoder.draw(6);
  }
}
