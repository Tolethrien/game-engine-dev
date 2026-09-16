import Aurora from "../core";
import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
} from "../pass";
import PassBinds, { PassBindEntries } from "../passBinds";
import shader from "../shaders/softGlow.wgsl?raw";

const DOWN_BINDS = {
  scene: { binding: 0, type: "texture" },
} satisfies PassBindEntries;
const MIX_BINDS = {
  scene: { binding: 0, type: "texture" },
  small: { binding: 1, type: "texture" },
} satisfies PassBindEntries;

export default class SoftGlowPass extends MultiPass {
  public readonly name = "softGlow";
  declare private down: GPURenderPipeline;
  declare private mix: GPURenderPipeline;
  declare private downBinds: PassBinds<typeof DOWN_BINDS>;
  declare private mixBinds: PassBinds<typeof MIX_BINDS>;

  async setup(targets: PassFormats) {
    this.downBinds = new PassBinds("softGlowDown", DOWN_BINDS);
    this.mixBinds = new PassBinds("softGlowMix", MIX_BINDS);
    [this.down, this.mix] = await Promise.all([
      Aurora.createRenderPipeline(
        { colors: [targets.formats.get("small")!] },
        {
          label: "softGlowDown",
          shader,
          binds: this.downBinds.layout,
          fragmentEntry: "downMain",
        },
      ),
      Aurora.createRenderPipeline(
        { colors: [targets.formats.get("scene")!] },
        {
          label: "softGlowMix",
          shader,
          binds: this.mixBinds.layout,
          fragmentEntry: "mixMain",
        },
      ),
    ]);
  }

  resources(res: PassResources) {
    res.modify("scene", { clear: false });
    res.temp(
      "small",
      { size: { scale: 0.5 }, format: "rgba16float" },
      { clear: false },
    );
    res.sampler("linearClamp");
  }

  execute(encoder: GPUCommandEncoder, ctx: MultiPassContext) {
    const down = ctx.beginRender("down", { colors: [{ name: "small" }] });
    down.setPipeline(this.down);
    down.setBindGroup(2, this.downBinds.get({ scene: ctx.view("scene") }));
    down.draw(6);
    down.end();

    const mix = ctx.beginRender("mix", { colors: [{ name: "scene" }] });
    mix.setPipeline(this.mix);
    mix.setBindGroup(
      2,
      this.mixBinds.get({ scene: ctx.view("scene"), small: ctx.view("small") }),
    );
    mix.draw(6);
    mix.end();
  }
}
