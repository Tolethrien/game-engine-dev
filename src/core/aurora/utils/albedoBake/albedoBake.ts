import Aurora from "@aurora/core";
import quadShader from "../fullScreenQuad/quadShader.wgsl?raw";
import bakeShader from "./albedoBakeShader.wgsl?raw";

// deeper levels mix neighbouring sprites of a sheet; 4 still covers zoom down to 1/8
const MAX_MIPS = 4;

type BakeStep = "premultiplyMain" | "downsampleMain";

// albedo is stored premultiplied with mips: linear filtering of straight alpha pulls the
// colour of transparent texels (black after decoding) into sprite edges as a dark fringe,
// and sprites drawn smaller than their texels need mips.
// Runs once per asset load, outside the render graph, so it has its own pipeline layouts.
export default class AlbedoBake {
  public static async bake(source: GPUTexture) {
    const device = Aurora.device;
    const module = Aurora.createShader(
      "albedoBakeShader",
      quadShader + bakeShader,
    );
    const [premultiply, downsample] = await Promise.all(
      (["premultiplyMain", "downsampleMain"] as BakeStep[]).map((entryPoint) =>
        device.createRenderPipelineAsync({
          label: `albedoBake:${entryPoint}Pipeline`,
          layout: "auto",
          vertex: { module, entryPoint: "vertexMain" },
          fragment: {
            module,
            entryPoint,
            targets: [{ format: source.format }],
          },
          primitive: { topology: "triangle-strip" },
        }),
      ),
    );
    const levels = Math.floor(Math.log2(Math.max(source.width, source.height))) + 1;
    const target = device.createTexture({
      label: source.label,
      format: source.format,
      size: {
        width: source.width,
        height: source.height,
        depthOrArrayLayers: source.depthOrArrayLayers,
      },
      mipLevelCount: Math.min(MAX_MIPS, levels),
      usage: source.usage,
    });

    const encoder = device.createCommandEncoder({ label: "albedoBake" });
    for (let layer = 0; layer < source.depthOrArrayLayers; layer++) {
      this.step(encoder, premultiply, source, target, layer, 0);
      for (let mip = 1; mip < target.mipLevelCount; mip++) {
        this.step(encoder, downsample, target, target, layer, mip);
      }
    }
    device.queue.submit([encoder.finish()]);
    // destroy waits for the submitted bake
    source.destroy();
    return target;
  }

  // reads mip - 1 of "from" (mip 0 when it is the straight source), writes mip of "to"
  private static step(
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    from: GPUTexture,
    to: GPUTexture,
    layer: number,
    mip: number,
  ) {
    const bindGroup = Aurora.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.levelView(from, layer, from === to ? mip - 1 : 0),
        },
      ],
    });
    const pass = encoder.beginRenderPass({
      label: `albedoBake:${layer}:${mip}`,
      colorAttachments: [
        {
          view: this.levelView(to, layer, mip),
          loadOp: "clear",
          storeOp: "store",
          clearValue: [0, 0, 0, 0],
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
  }

  private static levelView(texture: GPUTexture, layer: number, mip: number) {
    return texture.createView({
      dimension: "2d",
      baseArrayLayer: layer,
      arrayLayerCount: 1,
      baseMipLevel: mip,
      mipLevelCount: 1,
    });
  }
}
