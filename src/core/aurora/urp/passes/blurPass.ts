import Aurora from "@aurora/core";
import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
  StepColorTarget,
} from "@aurora/pass";
import type { TextureDescriptor } from "@aurora/resourcePool";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import FixedBuffer from "@aurora/utils/fixedBuffer";
import { AuroraUsage } from "@aurora/utils/usage";
import FullScreenQuad from "@aurora/utils/fullScreenQuad/fullScreen";
import blurShader from "../shaders/blurShader.wgsl?raw";
import { postDraw } from "../draw/drawPost";
import { EFFECT_MASK } from "./effectPass";

// mip 0 is half the render; scratch holds the horizontal gaussian of the picked level.
// pairs: bilinear taps per side of the gaussian, each merging two texels; covers 3 sigma of maxTexelSigma
const BLUR = Object.freeze({
  temp: "blur",
  scratch: "blurScratch",
  levels: 7,
  pairs: 3,
  maxTexelSigma: 2,
});
// variance in render px² a level already carries when read by the composite: every 13 tap
// downsample adds 1.75 of its source texel², the b-spline read 1/3 of the level's texel²
const LEVEL_VARIANCE = Array.from({ length: BLUR.levels }, (_, level) => {
  const texelArea = 4 ** (level + 1);
  return (1.75 * (texelArea - 1)) / 3 + texelArea / 3;
});
const BLUR_BINDS = {
  source: { binding: 0, type: "texture" },
  params: { binding: 1, type: "uniform" },
  scene: { binding: 2, type: "texture" },
} satisfies PassBindEntries;
interface BlurPipelines {
  downsample: GPURenderPipeline;
  horizontal: GPURenderPipeline;
  vertical: GPURenderPipeline;
  composite: GPURenderPipeline;
  compositeDirect: GPURenderPipeline;
}

// gaussian blur of the hdr world: after diffusion, before the post lut, so lights spread
// like light and grain, vignette and gui stay sharp on top. The cost barely grows with sigma:
// the pyramid does the bulk, a small gaussian on one level fills in the rest
export default class BlurPass extends MultiPass {
  name = "BlurPass";
  category = "world";
  // step labels made once, the timer reads one per step every frame
  private readonly labels = Array.from(
    { length: BLUR.levels },
    (_, level) => `down:mip${level}`,
  );
  declare private pipelines: BlurPipelines;
  declare private binds: PassBinds<typeof BLUR_BINDS>;
  declare private uniform: FixedBuffer;

  // read every frame, so Post.setBlur needs no rebuild
  enabled() {
    const { sigma, amount } = postDraw.getBlur;
    return sigma > 0 && amount > 0;
  }
  destroy() {
    this.uniform.destroy();
  }
  async setup(targets: PassFormats) {
    this.uniform = new FixedBuffer({
      label: "blurPass",
      // laid out like Blur in the shader
      words: 16,
      usage: AuroraUsage.uniform,
    });
    // pyramid steps, both gaussian steps and the composite of one frame
    this.binds = new PassBinds("blurPass", BLUR_BINDS, BLUR.levels + 4);
    const pyramid = { colors: [targets.formats.get(BLUR.temp)!] };
    const scene = { colors: [targets.formats.get("offscreenCanvas")!] };
    const create = (
      entry: string,
      pipelineTargets: { colors: GPUTextureFormat[] },
      constants?: Record<string, boolean>,
    ) =>
      FullScreenQuad.createPipeline(pipelineTargets, {
        label: `BlurPass:${entry}`,
        shader: blurShader,
        binds: this.binds.layout,
        fragmentEntry: `fragment${entry}`,
        constants,
      });
    const [downsample, horizontal, vertical, composite, compositeDirect] =
      await Promise.all([
        create("Downsample", pyramid),
        create("Gaussian", pyramid, { horizontal: true }),
        create("Gaussian", pyramid, { horizontal: false }),
        create("Composite", scene, { direct: false }),
        create("Composite", scene, { direct: true }),
      ]);
    this.pipelines = {
      downsample,
      horizontal,
      vertical,
      composite,
      compositeDirect,
    };
  }
  resources(res: PassResources) {
    // every pixel is overwritten, a clear of the new version would be wasted
    res.modify("offscreenCanvas", { clear: false });
    const pyramid: TextureDescriptor = {
      format: "rgba16float",
      size: { scale: 0.5, base: "render" },
      mips: BLUR.levels,
    };
    // each used level is fully written before anything reads it
    res.temp(BLUR.temp, pyramid, { clear: false });
    res.temp(BLUR.scratch, pyramid, { clear: false });
    res.sampler("linearClamp");
  }
  execute(_encoder: GPUCommandEncoder, ctx: MultiPassContext) {
    const level = this.writeParams();
    const scene = ctx.view("offscreenCanvas");
    const pipelines = this.pipelines;
    if (level >= 0) {
      for (let mip = 0; mip <= level; mip++) {
        const source = mip === 0 ? scene : ctx.output(BLUR.temp, mip - 1);
        const target = { name: BLUR.temp, mip };
        const label = this.labels[mip];
        this.drawStep(ctx, label, target, pipelines.downsample, source, scene);
      }
      const pyramidLevel = ctx.output(BLUR.temp, level);
      const scratch = { name: BLUR.scratch, mip: level };
      const horizontal = pipelines.horizontal;
      this.drawStep(ctx, "gaussian:h", scratch, horizontal, pyramidLevel, scene);
      const scratchLevel = ctx.output(BLUR.scratch, level);
      const target = { name: BLUR.temp, mip: level };
      const vertical = pipelines.vertical;
      this.drawStep(ctx, "gaussian:v", target, vertical, scratchLevel, scene);
    }
    const direct = level < 0;
    this.drawStep(
      ctx,
      "composite",
      { name: "offscreenCanvas" },
      direct ? pipelines.compositeDirect : pipelines.composite,
      direct ? scene : ctx.output(BLUR.temp, level),
      scene,
    );
  }

  private drawStep(
    ctx: MultiPassContext,
    label: string,
    target: StepColorTarget,
    pipeline: GPURenderPipeline,
    source: GPUTextureView,
    scene: GPUTextureView,
  ) {
    const step = ctx.beginRender(label, { colors: [target] });
    step.setPipeline(pipeline);
    step.setBindGroup(
      2,
      this.binds.get({ source, params: this.uniform.getBuffer, scene }),
    );
    FullScreenQuad.draw(step);
    step.end();
  }
  // picks the highest level whose own blur stays under sigma, -1 = none (the composite blurs
  // the scene directly), and writes the gaussian that fills in the rest, in that level's texels
  private writeParams() {
    const blur = postDraw.getBlur;
    // sigma is in view pixels, the pyramid works in render texels
    const sigma = blur.sigma * Aurora.getRenderScale;
    const variance = sigma * sigma;
    let level = -1;
    while (level + 1 < BLUR.levels && LEVEL_VARIANCE[level + 1] <= variance) {
      level++;
    }
    const carried = level < 0 ? 0 : LEVEL_VARIANCE[level];
    const texel = 2 ** (level + 1);
    // only beyond the top level: sigma is capped there
    const texelSigma = Math.min(
      Math.sqrt(variance - carried) / texel,
      BLUR.maxTexelSigma,
    );

    const floats = this.uniform.floats;
    const tapWeight = (distance: number) =>
      texelSigma > 0
        ? Math.exp(-(distance * distance) / (2 * texelSigma * texelSigma))
        : distance === 0 ? 1 : 0;
    let total = tapWeight(0);
    floats[0] = total;
    for (let pair = 0; pair < BLUR.pairs; pair++) {
      const near = pair * 2 + 1;
      const nearWeight = tapWeight(near);
      const farWeight = tapWeight(near + 1);
      const weight = nearWeight + farWeight;
      floats[1 + pair] = weight;
      // the spot between both texels where one bilinear tap reads them in the right ratio
      floats[4 + pair] = weight > 0 ? near + farWeight / weight : near;
      total += weight * 2;
    }
    for (let word = 0; word < 4; word++) floats[word] /= total;
    floats[7] = blur.amount;
    floats[8] = blur.center.x;
    floats[9] = blur.center.y;
    floats[10] = blur.reach;
    floats[11] = blur.smoothness;
    floats[12] = blur.roundness;
    this.uniform.uints[13] = EFFECT_MASK[blur.mask];
    this.uniform.upload();
    return level;
  }
}
