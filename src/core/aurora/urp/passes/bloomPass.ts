import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
} from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import FixedBuffer from "@aurora/utils/fixedBuffer";
import Blend from "@aurora/utils/blend";
import { AuroraUsage } from "@aurora/utils/usage";
import FullScreenQuad from "@aurora/utils/fullScreenQuad/fullScreen";
import bloomShader from "../shaders/bloomShader.wgsl?raw";
import { postDraw } from "../draw/drawPost";
import AxiomMath from "@axiom/math";

// mip 0 is half the render, each level halves it again; 8 still fits the smallest renderRes (640x360)
const BLOOM = Object.freeze({ temp: "bloom", levels: 8 });
const BLOOM_BINDS = {
  source: { binding: 0, type: "texture" },
  params: { binding: 1, type: "uniform" },
  scene: { binding: 2, type: "texture" },
} satisfies PassBindEntries;
interface BloomPipelines {
  prefilter: GPURenderPipeline;
  downsample: GPURenderPipeline;
  upsample: GPURenderPipeline;
  composite: GPURenderPipeline;
}

// glow of the hdr world: after the light composite so lit pixels count, before the tone map
// that needs the real values over 1. A MultiPass: every level of the pyramid is its own step
export default class BloomPass extends MultiPass {
  name = "BloomPass";
  category = "world";
  // step labels made once, the timer reads one per step every frame
  private readonly labels = {
    down: levelLabels("down"),
    up: levelLabels("up"),
  };
  declare private pipelines: BloomPipelines;
  declare private binds: PassBinds<typeof BLOOM_BINDS>;
  declare private uniform: FixedBuffer;

  // read every frame, so Post.setBloom({ enabled }) needs no rebuild
  enabled() {
    const { enabled, intensity } = postDraw.getBloom;
    return enabled && intensity > 0;
  }
  destroy() {
    this.uniform.destroy();
  }
  async setup(targets: PassFormats) {
    this.uniform = new FixedBuffer({
      label: "bloomPass",
      words: 4,
      usage: AuroraUsage.uniform,
    });
    // one bind group per source: the scene and every mip
    this.binds = new PassBinds("bloomPass", BLOOM_BINDS, BLOOM.levels + 2);
    const pyramid = { colors: [targets.formats.get(BLOOM.temp)!] };
    const scene = { colors: [targets.formats.get("offscreenCanvas")!] };
    const create = (
      entry: string,
      pipelineTargets: { colors: GPUTextureFormat[] },
      blend?: GPUBlendState,
    ) =>
      FullScreenQuad.createPipeline(pipelineTargets, {
        label: `BloomPass:${entry}`,
        shader: bloomShader,
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
      BLOOM.temp,
      {
        format: "rgba16float",
        size: { scale: 0.5, base: "render" },
        mips: BLOOM.levels,
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
    const { scatter, radius } = postDraw.getBloom;
    // the levels above radius are skipped whole: the wide haze never forms, the glow near
    // the source still fades softly since the top used level is blurred itself
    const levels = AxiomMath.clamp(Math.round(radius), 1, BLOOM.levels);
    this.drawStep(this.openStep(ctx, "prefilter", 0, prefilter, scene, scene));
    for (let level = 1; level < levels; level++) {
      const source = ctx.output(BLOOM.temp, level - 1);
      const label = this.labels.down[level];
      this.drawStep(
        this.openStep(ctx, label, level, downsample, source, scene),
      );
    }
    // back up: each level becomes lerp(its own downsample, the blurred one below, scatter),
    // so a high scatter lets the wide levels reach mip 0 with more weight
    for (let level = levels - 2; level >= 0; level--) {
      const source = ctx.output(BLOOM.temp, level + 1);
      const label = this.labels.up[level];
      const step = this.openStep(ctx, label, level, upsample, source, scene);
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
        source: ctx.output(BLOOM.temp, 0),
        params: this.uniform.getBuffer,
        scene,
      }),
    );
    this.drawStep(step);
  }

  private openStep(
    ctx: MultiPassContext,
    label: string,
    level: number,
    pipeline: GPURenderPipeline,
    source: GPUTextureView,
    scene: GPUTextureView,
  ) {
    const step = ctx.beginRender(label, {
      colors: [{ name: BLOOM.temp, mip: level }],
    });
    step.setPipeline(pipeline);
    step.setBindGroup(
      2,
      this.binds.get({ source, params: this.uniform.getBuffer, scene }),
    );
    return step;
  }
  private drawStep(step: GPURenderPassEncoder) {
    FullScreenQuad.draw(step);
    step.end();
  }
  private writeParams() {
    const { threshold, knee, intensity } = postDraw.getBloom;
    const floats = this.uniform.floats;
    floats[0] = threshold;
    floats[1] = threshold * knee;
    // the lerp chain keeps mip 0 at the scale of one level, no sum to divide out
    floats[2] = intensity;
    this.uniform.upload();
  }
}

function levelLabels(prefix: string) {
  return Array.from(
    { length: BLOOM.levels },
    (_, level) => `${prefix}:mip${level}`,
  );
}
