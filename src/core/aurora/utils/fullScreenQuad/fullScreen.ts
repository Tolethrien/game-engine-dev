import Aurora, { RenderPipelineOptions } from "@aurora/core";
import type { PipelineTargets } from "@aurora/pass";
import quadShader from "./quadShader.wgsl?raw";

export type FullScreenPipelineOptions = Omit<
  RenderPipelineOptions,
  "buffers" | "topology" | "vertexEntry"
>;

export default class FullScreenQuad {
  private static readonly VERTICES = 4;

  public static createPipeline(
    targets: PipelineTargets,
    options: FullScreenPipelineOptions,
  ) {
    return Aurora.createRenderPipeline(targets, {
      ...options,
      shader: quadShader + options.shader,
      topology: "triangle-strip",
    });
  }

  public static draw(encoder: GPURenderPassEncoder) {
    encoder.draw(this.VERTICES);
  }
}
