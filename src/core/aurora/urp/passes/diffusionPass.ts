import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
} from "@aurora/pass";
import Aurora from "@aurora/core";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import FixedBuffer from "@aurora/utils/fixedBuffer";
import Blend from "@aurora/utils/blend";
import { AuroraUsage } from "@aurora/utils/usage";
import FullScreenQuad from "@aurora/utils/fullScreenQuad/fullScreen";
import diffusionShader from "../shaders/diffusionShader.wgsl?raw";
import { postDraw } from "../draw/drawPost";
import AxiomMath from "@axiom/math";

// mip 0 is half the render; fewer levels than bloom, the softness stays local.
// scatter is fixed: lerp weight of the wider levels on the way up, like BloomProps.scatter
const DIFFUSION = Object.freeze({ temp: "diffusion", levels: 6, scatter: 0.6 });
const DIFFUSION_BINDS = {
  source: { binding: 0, type: "texture" },
  params: { binding: 1, type: "uniform" },
  scene: { binding: 2, type: "texture" },
  veil: { binding: 3, type: "texture" },
} satisfies PassBindEntries;
interface DiffusionPipelines {
  prefilter: GPURenderPipeline;
  downsample: GPURenderPipeline;
  upsample: GPURenderPipeline;
  composite: GPURenderPipeline;
}

// the "after rain" look in hdr: after bloom so its glow gets softened too, before the post
// lut. A copy of BloomPass without the threshold, mixed instead of added; shared code
// waits for shaders built from pieces
export default class DiffusionPass extends MultiPass {
  name = "DiffusionPass";
  category = "world";
  // step labels made once, the timer reads one per step every frame
  private readonly labels = {
    down: levelLabels("down"),
    up: levelLabels("up"),
  };
  declare private pipelines: DiffusionPipelines;
  declare private binds: PassBinds<typeof DIFFUSION_BINDS>;
  declare private uniform: FixedBuffer;

  // read every frame, so Post.setDiffusion needs no rebuild
  enabled() {
    const { amount, haze } = postDraw.getDiffusion;
    return amount > 0 || haze > 0;
  }
  destroy() {
    this.uniform.destroy();
  }
  async setup(targets: PassFormats) {
    this.uniform = new FixedBuffer({
      label: "diffusionPass",
      // laid out like Diffusion in the shader: hazeColor, amount, haze, pad
      words: 8,
      usage: AuroraUsage.uniform,
    });
    // one bind group per source: the scene and every mip
    this.binds = new PassBinds(
      "diffusionPass",
      DIFFUSION_BINDS,
      DIFFUSION.levels + 2,
    );
    const pyramid = { colors: [targets.formats.get(DIFFUSION.temp)!] };
    const scene = { colors: [targets.formats.get("offscreenCanvas")!] };
    const create = (
      entry: string,
      pipelineTargets: { colors: GPUTextureFormat[] },
      blend?: GPUBlendState,
    ) =>
      FullScreenQuad.createPipeline(pipelineTargets, {
        label: `DiffusionPass:${entry}`,
        shader: diffusionShader,
        binds: this.binds.layout,
        fragmentEntry: `fragment${entry}`,
        blend,
      });
    const [prefilter, downsample, upsample, composite] = await Promise.all([
      create("Prefilter", pyramid),
      create("Downsample", pyramid),
      create("Upsample", pyramid, Blend.lerpConstant),
      create("Composite", scene),
    ]);
    this.pipelines = { prefilter, downsample, upsample, composite };
  }
  resources(res: PassResources) {
    // every pixel is overwritten, a clear of the new version would be wasted
    res.modify("offscreenCanvas", { clear: false });
    res.temp(
      DIFFUSION.temp,
      {
        format: "rgba16float",
        size: { scale: 0.5, base: "render" },
        mips: DIFFUSION.levels,
      },
      // each level is fully written before anything reads it
      { clear: false },
    );
    res.sampler("linearClamp");
  }
  execute(_encoder: GPUCommandEncoder, ctx: MultiPassContext) {
    this.writeParams();
    const scene = ctx.view("offscreenCanvas");
    const { prefilter, downsample, upsample, composite } = this.pipelines;
    const levels = AxiomMath.clamp(
      Math.round(postDraw.getDiffusion.radius),
      1,
      DIFFUSION.levels,
    );
    this.drawStep(this.openStep(ctx, "prefilter", 0, prefilter, scene, scene));
    for (let level = 1; level < levels; level++) {
      const source = ctx.output(DIFFUSION.temp, level - 1);
      const label = this.labels.down[level];
      this.drawStep(
        this.openStep(ctx, label, level, downsample, source, scene),
      );
    }
    // the top level is never overwritten on the way up: it stays the veil
    for (let level = levels - 2; level >= 0; level--) {
      const source = ctx.output(DIFFUSION.temp, level + 1);
      const label = this.labels.up[level];
      const step = this.openStep(ctx, label, level, upsample, source, scene);
      const scatter = DIFFUSION.scatter;
      step.setBlendConstant([scatter, scatter, scatter, scatter]);
      this.drawStep(step);
    }

    const step = ctx.beginRender("composite", {
      colors: [{ name: "offscreenCanvas" }],
    });
    step.setPipeline(composite);
    step.setBindGroup(
      2,
      this.binds.get({
        source: ctx.output(DIFFUSION.temp, 0),
        params: this.uniform.getBuffer,
        scene,
        veil: ctx.output(DIFFUSION.temp, levels - 1),
      }),
    );
    this.drawStep(step);
  }

  // the veil slot takes the scene in pyramid steps: a mip there could be the step's own target
  private openStep(
    ctx: MultiPassContext,
    label: string,
    level: number,
    pipeline: GPURenderPipeline,
    source: GPUTextureView,
    scene: GPUTextureView,
  ) {
    const step = ctx.beginRender(label, {
      colors: [{ name: DIFFUSION.temp, mip: level }],
    });
    step.setPipeline(pipeline);
    step.setBindGroup(
      2,
      this.binds.get({
        source,
        params: this.uniform.getBuffer,
        scene,
        veil: scene,
      }),
    );
    return step;
  }
  private drawStep(step: GPURenderPassEncoder) {
    FullScreenQuad.draw(step);
    step.end();
  }
  private writeParams() {
    const { amount, haze, hazeColor } = postDraw.getDiffusion;
    const floats = this.uniform.floats;
    floats[0] = Aurora.colorChannel(hazeColor[0]);
    floats[1] = Aurora.colorChannel(hazeColor[1]);
    floats[2] = Aurora.colorChannel(hazeColor[2]);
    floats[3] = amount;
    floats[4] = haze;
    this.uniform.upload();
  }
}

function levelLabels(prefix: string) {
  return Array.from(
    { length: DIFFUSION.levels },
    (_, level) => `${prefix}:mip${level}`,
  );
}
