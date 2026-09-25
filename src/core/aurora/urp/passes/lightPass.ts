import Aurora from "@aurora/core";
import { PassResources, PassTargets, RenderPass } from "@aurora/pass";
import PassBinds, { PassBindEntries } from "@aurora/passBinds";
import FixedBuffer from "@aurora/utils/fixedBuffer";
import GrowingBuffer from "@aurora/utils/growingBuffer";
import Blend from "@aurora/utils/blend";
import { AuroraUsage } from "@aurora/utils/usage";
import FullScreenQuad from "@aurora/utils/fullScreenQuad/fullScreen";
import ambientShader from "../shaders/ambientShader.wgsl?raw";
import lightShader from "../shaders/lightShader.wgsl?raw";
import { LIGHT_LAYOUT, LightWriter, lightDraw } from "../draw/drawLight";

const LIGHT_BINDS = {
  ambient: { binding: 0, type: "uniform" },
} satisfies PassBindEntries;

const WHITE_AMBIENT = {
  enabled: true,
  from: [255, 255, 255, 255],
  to: [255, 255, 255, 255],
  angle: 0,
  intensity: 1,
} as const;

// light map: the ambient gradient, then every light added on top
export default class LightPass extends RenderPass {
  name: string = "LightPass";
  category: string = "world";
  private lights = new GrowingBuffer({
    label: "lightPassLights",
    stride: LIGHT_LAYOUT.stride,
    usage: AuroraUsage.buffer.VERTEX,
  });
  private writer = LIGHT_LAYOUT.createWriter(this.lights);
  private readonly frameStats = { lights: 0, instanceBytes: 0 };
  declare private pipelines: {
    ambient: GPURenderPipeline;
    lights: GPURenderPipeline;
  };
  declare private binds: PassBinds<typeof LIGHT_BINDS>;
  declare private ambientUniform: FixedBuffer;

  destroy() {
    this.ambientUniform.destroy();
    this.lights.destroy();
  }
  stats() {
    this.frameStats.lights = this.lights.getCount;
    this.frameStats.instanceBytes = this.lights.getGpuBytes;
    return this.frameStats;
  }
  public push(): LightWriter {
    this.writer.at(this.lights.push());
    return this.writer;
  }
  clearFrame() {
    this.lights.clear();
  }
  async setup(targets: PassTargets) {
    this.ambientUniform = new FixedBuffer({
      label: "lightPassAmbient",
      words: 12,
      usage: AuroraUsage.uniform,
    });
    this.binds = new PassBinds("lightPass", LIGHT_BINDS);
    const [ambient, lights] = await Promise.all([
      FullScreenQuad.createPipeline(targets, {
        label: "LightPass:ambient",
        shader: ambientShader,
        binds: this.binds.layout,
      }),
      Aurora.createRenderPipeline(targets, {
        label: "LightPass:lights",
        shader: lightShader,
        buffers: [LIGHT_LAYOUT.layout],
        blend: Blend.additivePremultiplied,
        constants: { linearColors: Aurora.isLinear },
      }),
    ]);
    this.pipelines = { ambient, lights };
    lightDraw.setTarget(this);
  }
  resources(res: PassResources) {
    res.create("lightMap", {
      format: "rgba16float",
      size: { base: "render", scale: 1 },
    });
  }
  execute(encoder: GPURenderPassEncoder) {
    this.writeAmbient();
    encoder.setPipeline(this.pipelines.ambient);
    encoder.setBindGroup(
      2,
      this.binds.get({ ambient: this.ambientUniform.getBuffer }),
    );
    FullScreenQuad.draw(encoder);

    const count = this.lights.getCount;
    if (count === 0) return;
    this.lights.upload();
    // order does not matter: lights only add up
    encoder.setPipeline(this.pipelines.lights);
    encoder.setVertexBuffer(0, this.lights.getBuffer);
    encoder.draw(6, count);
  }

  private writeAmbient() {
    // off: a white map, so what still reads it (world effects) sees an unlit scene
    const { from, to, angle, intensity } = lightDraw.getEnabled
      ? lightDraw.getAmbient
      : WHITE_AMBIENT;
    const floats = this.ambientUniform.floats;
    for (let channel = 0; channel < 3; channel++) {
      floats[channel] = Aurora.colorChannel(from[channel]) * intensity;
      floats[4 + channel] = Aurora.colorChannel(to[channel]) * intensity;
    }
    // scaled by the render size so the angle holds on a non-square screen,
    // normalized so the gradient runs 0..1 corner to corner at any angle
    const { width, height } = Aurora.getRenderSize;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const extent = Math.abs(cos) * width + Math.abs(sin) * height;
    floats[8] = (cos * width) / extent;
    floats[9] = (sin * height) / extent;
    this.ambientUniform.upload();
  }
}
