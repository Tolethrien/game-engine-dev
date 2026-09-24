import Aurora from "@aurora/core";
import {
  MultiPass,
  MultiPassContext,
  PassFormats,
  PassResources,
} from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import ResourcePool, { ReservedTexture } from "@aurora/resourcePool";
import FixedBuffer from "@aurora/utils/fixedBuffer";
import { AuroraUsage } from "@aurora/utils/usage";
import FullScreenQuad from "@aurora/utils/fullScreenQuad/fullScreen";
import lutBakeShader from "../shaders/lutBakeShader.wgsl?raw";
import postShader from "../shaders/postShader.wgsl?raw";
import { postDraw } from "../draw/drawPost";
import type {
  AgxLook,
  ColorGrading,
  ToneMapMode,
  ScreenBlend,
} from "../draw/drawTypes";
import Time from "@engine/time";
import AxiomMath from "@axiom/math";

// must match MODE_* in shaders/lutBakeShader.wgsl
export const TONE_MAPPING = Object.freeze({
  none: 0,
  reinhard: 1,
  aces: 2,
  filmic: 3,
  agx: 4,
} satisfies Record<ToneMapMode, number>);
// must match BLEND_* in shaders/postShader.wgsl and effects/effectShader.wgsl
export const SCREEN_BLEND = Object.freeze({
  multiply: 0,
  mix: 1,
  additive: 2,
} satisfies Record<ScreenBlend, number>);
// ASC CDL + saturation after the agx curve, values of the minimal agx by Benjamin Wrensch
const AGX_LOOKS: Record<
  AgxLook,
  { slope: RGB; power: RGB; saturation: number }
> = {
  none: { slope: [1, 1, 1], power: [1, 1, 1], saturation: 1 },
  punchy: { slope: [1, 1, 1], power: [1.35, 1.35, 1.35], saturation: 1.4 },
  golden: { slope: [1, 0.9, 0.5], power: [0.8, 0.8, 0.8], saturation: 0.8 },
};
// 32 cells per axis like Unity; the texture outlives rebuilds, other passes may read it by name
const LUT = Object.freeze({ name: "postLut", size: 32 });
const RADIAL_BLUR = Object.freeze({ minSamples: 2, maxSamples: 32 });

const BAKE_BINDS = {
  lut: {
    binding: 0,
    type: "storageTexture",
    format: "rgba16float",
    access: "write-only",
    dimension: "3d",
  },
  params: { binding: 1, type: "uniform" },
} satisfies PassBindEntries;
const POST_BINDS = {
  scene: { binding: 0, type: "texture" },
  lut: { binding: 1, type: "texture", dimension: "3d" },
  params: { binding: 2, type: "uniform" },
} satisfies PassBindEntries;

// the tone map curve and the color grading baked into a 3d lut whenever they change,
// so every pixel pays one lut sample however long the chain is; before the gui, which stays exact
export default class PostPass extends MultiPass {
  name = "PostPass";
  category = "world";
  // a new instance after a rebuild bakes on its first frame
  private bakedVersion = -1;
  private grainSeed = 0;
  declare private lut: ReservedTexture;
  declare private pipelines: {
    bake: GPUComputePipeline;
    post: GPURenderPipeline;
  };
  declare private binds: {
    bake: PassBinds<typeof BAKE_BINDS>;
    post: PassBinds<typeof POST_BINDS>;
  };
  declare private uniforms: { bake: FixedBuffer; post: FixedBuffer };

  // read every frame, so every Post setter works without a rebuild
  enabled() {
    return (
      postDraw.usesLut || postDraw.getExposure !== 0 || postDraw.hasEffects
    );
  }
  // game time, so a fading flash stops on pause
  clearFrame() {
    postDraw.tick(Time.getDeltaTime());
  }
  destroy() {
    this.lut.free();
    this.uniforms.bake.destroy();
    this.uniforms.post.destroy();
  }
  async setup(targets: PassFormats) {
    this.lut = ResourcePool.reserve(LUT.name, {
      size: { width: LUT.size, height: LUT.size },
      layers: LUT.size,
      dimension: "3d",
      format: "rgba16float",
    });
    this.uniforms = {
      // laid out like Bake in lutBakeShader.wgsl
      bake: new FixedBuffer({
        label: "postPass:bake",
        words: 20,
        usage: AuroraUsage.uniform,
      }),
      // laid out like Post in postShader.wgsl
      post: new FixedBuffer({
        label: "postPass:post",
        words: 28,
        usage: AuroraUsage.uniform,
      }),
    };
    this.binds = {
      bake: new PassBinds("postPass:bake", BAKE_BINDS),
      post: new PassBinds("postPass:post", POST_BINDS),
    };
    const [bake, post] = await Promise.all([
      Aurora.createComputePipeline({
        label: "PostPass:bake",
        shader: lutBakeShader,
        binds: this.binds.bake.layout,
      }),
      FullScreenQuad.createPipeline(
        { colors: [targets.formats.get("offscreenCanvas")!] },
        {
          label: "PostPass:post",
          shader: postShader,
          binds: this.binds.post.layout,
        },
      ),
    ]);
    this.pipelines = { bake, post };
  }
  resources(res: PassResources) {
    // every pixel is overwritten, a clear of the new version would be wasted
    res.modify("offscreenCanvas", { clear: false });
    res.sampler("linearClamp");
  }
  execute(_encoder: GPUCommandEncoder, ctx: MultiPassContext) {
    const useLut = postDraw.usesLut;
    if (useLut && this.bakedVersion !== postDraw.getLutVersion) {
      this.bakedVersion = postDraw.getLutVersion;
      this.bakeLut(ctx);
    }

    const post = this.writePost(useLut);
    const step = ctx.beginRender("post", {
      colors: [{ name: "offscreenCanvas" }],
    });
    step.setPipeline(this.pipelines.post);
    step.setBindGroup(
      2,
      this.binds.post.get({
        scene: ctx.view("offscreenCanvas"),
        lut: this.lut.view(),
        params: post.getBuffer,
      }),
    );
    FullScreenQuad.draw(step);
    step.end();
  }

  private bakeLut(ctx: MultiPassContext) {
    this.writeBake();
    const step = ctx.beginCompute("bake");
    step.setPipeline(this.pipelines.bake);
    step.setBindGroup(
      2,
      this.binds.bake.get({
        lut: this.lut.view(),
        params: this.uniforms.bake.getBuffer,
      }),
    );
    Aurora.dispatch(step, { width: LUT.size, height: LUT.size }, LUT.size);
    step.end();
  }
  private writePost(useLut: boolean) {
    const { radialBlur, chroma, posterize, vignette, flash, grain } =
      postDraw.getEffects;
    const post = this.uniforms.post;
    const { floats, uints } = post;
    floats[0] = 2 ** postDraw.getExposure;
    uints[1] = useLut ? 1 : 0;
    floats[2] = posterize;
    uints[3] = this.grainSeed++;
    floats[4] = radialBlur.center.x;
    floats[5] = radialBlur.center.y;
    floats[6] = radialBlur.strength;
    uints[7] = AxiomMath.clamp(
      Math.round(radialBlur.samples),
      RADIAL_BLUR.minSamples,
      RADIAL_BLUR.maxSamples,
    );
    floats[8] = chroma.center.x;
    floats[9] = chroma.center.y;
    floats[10] = chroma.intensity;
    floats[11] = grain.intensity;
    writeLinear(floats, 12, vignette.color);
    floats[15] = vignette.intensity;
    floats[16] = vignette.center.x;
    floats[17] = vignette.center.y;
    floats[18] = vignette.smoothness;
    floats[19] = vignette.roundness;
    writeLinear(floats, 20, flash.color);
    floats[23] = flash.amount;
    uints[24] = SCREEN_BLEND[vignette.blend];
    floats[25] = grain.response;
    floats[26] = grain.size;
    post.upload();
    return post;
  }
  private writeBake() {
    const color = postDraw.getColor;
    const look = AGX_LOOKS[postDraw.getAgxLook];
    const { floats, uints } = this.uniforms.bake;
    uints[0] = TONE_MAPPING[postDraw.getToneMapping];
    floats[1] = look.saturation;
    floats[2] = color.brightness;
    floats[3] = color.contrast;
    floats.set(look.slope, 4);
    floats[7] = color.saturation;
    floats.set(look.power, 8);
    floats[11] = color.hueShift / 360;
    floats.set(whiteBalance(color), 12);
    floats[15] = color.sepia;
    writeLinear(floats, 16, color.filter);
    floats[19] = color.invert;
    this.uniforms.bake.upload();
  }
}

function writeLinear(floats: Float32Array, offset: number, color: Readonly<RGBA>) {
  floats[offset] = Aurora.colorChannel(color[0]);
  floats[offset + 1] = Aurora.colorChannel(color[1]);
  floats[offset + 2] = Aurora.colorChannel(color[2]);
}
// lms gains of Unity's white balance (ColorBalanceToLMSCoeffs): temperature moves the
// white point along the daylight locus, tint across it; neutral is exactly 1 so nothing drifts
function whiteBalance({ temperature, tint }: Readonly<ColorGrading>): RGB {
  if (temperature === 0 && tint === 0) return [1, 1, 1];
  const warm = (temperature * 100) / 60;
  const green = (tint * 100) / 60;
  // the ends of the scale are reached at different speeds, like in Unity
  const x = 0.31271 - warm * (warm < 0 ? 0.1 : 0.05);
  const y = 2.87 * x - 3 * x * x - 0.27509507 + green * 0.05;
  const target = xyToLms(x, y);
  // D65 in lms
  return [0.949237 / target[0], 1.03542 / target[1], 1.08728 / target[2]];
}
function xyToLms(x: number, y: number): RGB {
  const X = x / y;
  const Z = (1 - x - y) / y;
  return [
    0.7328 * X + 0.4296 - 0.1624 * Z,
    -0.7036 * X + 1.6975 + 0.0061 * Z,
    0.003 * X + 0.0136 + 0.9834 * Z,
  ];
}
