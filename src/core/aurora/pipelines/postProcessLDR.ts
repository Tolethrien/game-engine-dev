import { assert, deepMerge, flatObjectToValues } from "../../../utils/utils";
import { PipelineBind } from "../aurora";
import Aurora from "../core";
import AuroraDebugInfo from "../debugger/debugInfo";
import Renderer from "../renderer/renderer";
import chromaShader from "../shaders/post/chromaAbber.wgsl?raw";
import vignetteShader from "../shaders/post/vignette.wgsl?raw";

export interface PostLDR {
  chromaticAberration?: {
    /**range [0-1] */
    str?: number;
  };
  vignette?: {
    color?: RGB;
    str?: number;
    offset?: Position2D;
    radius?: number;
  };
}

//order matters!
const AVAILABLE_POSTS_SHADERS = {
  chromaticAberration: chromaShader,
  vignette: vignetteShader,
};
//order matters for padding on GPU!
const postLDR: PostLDR = {
  chromaticAberration: {
    str: 0,
  },
  vignette: {
    color: [0, 0, 0],
    str: 0,
    offset: { x: 0, y: 0 },
    radius: 0,
  },
};
const DATA_SIZES = {
  chromaticAberration: { offset: 0, size: 1 },
  vignette: { offset: 1, size: 7 },
};
type PostName = keyof typeof AVAILABLE_POSTS_SHADERS;
export default class PostProcessLDR {
  private static layout: PipelineBind[1];
  private static pipelines: Map<string, GPURenderPipeline> = new Map();
  private static buffers: Map<string, GPUBuffer> = new Map();
  private static postUsedInFrame: Set<PostName> = new Set();
  private static PPOptions = postLDR;
  private static PPData = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]);
  public static clearPipeline(): void {}

  public static async createPipeline() {
    this.layout = Aurora.createBindLayout({
      label: "PostProcessLDRLayout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {},
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "2d" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const pipelineLayout = Aurora.createPipelineLayout([this.layout]);

    for (const [postName, shaderName] of Object.entries(
      AVAILABLE_POSTS_SHADERS
    )) {
      const shader = Aurora.createShader(shaderName, shaderName);
      const pipeline = await Aurora.createRenderPipeline({
        shader: shader,
        pipelineName: `PostProcessLDRPipeline:${postName}`,
        buffers: [],
        pipelineLayout: pipelineLayout,
        colorTargets: [Aurora.getColorTargetTemplate("HDR")],
      });
      this.pipelines.set(postName, pipeline);

      const buffer = Aurora.createBuffer({
        bufferType: "uniform",
        dataLength: DATA_SIZES[postName as PostName].size * 2,
        dataType: "Float32Array",
        label: `PostLDRBuffer:${postName}`,
      });
      this.buffers.set(postName, buffer);
    }
  }
  public static usePipeline(): void {
    const indexBuffer = Renderer.getBuffer("index");
    const commandEncoder = Renderer.getEncoder;
    let readFromTexture = "finalDraw";
    let writeToTexture = "pingX1";
    let currentPass = 0;

    this.postUsedInFrame.forEach((post, index) => {
      const isLastPass = currentPass === this.postUsedInFrame.size - 1;
      if (isLastPass) writeToTexture = "PostLDR";
      const timestamp = AuroraDebugInfo.setTimestamp(
        currentPass === 0 ? "postLDRStart" : undefined,
        isLastPass ? "postLDREnd" : undefined
      );
      const texture = Renderer.getTextureView(writeToTexture);
      const bind = this.generateBind(post, readFromTexture);
      const pipeline = this.getPipeline(post);

      const passEncoder = commandEncoder.beginRenderPass({
        label: "PostProcessRenderPass",
        colorAttachments: [
          {
            view: texture,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        timestampWrites: timestamp,
      });
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bind);
      passEncoder.setIndexBuffer(indexBuffer, "uint32");
      passEncoder.drawIndexed(6, 1);
      passEncoder.end();
      AuroraDebugInfo.accumulate("drawCalls", 1);
      AuroraDebugInfo.accumulate("renderPasses", 1);
      AuroraDebugInfo.accumulate("usedPostProcessing", [post]);
      currentPass++;
      if (isLastPass) return;

      if (writeToTexture === "pingX1") {
        writeToTexture = "pongX1";
        readFromTexture = "pingX1";
      } else {
        writeToTexture = "pingX1";
        readFromTexture = "pongX1";
      }
    });
    if (this.isPostProcessLDRUsedInFrame())
      AuroraDebugInfo.accumulate("pipelineInUse", ["PostProcessLDR"]);
  }

  public static setPostProcess(options: PostLDR) {
    this.PPOptions = deepMerge(this.PPOptions, options);
    const data = flatObjectToValues(this.PPOptions);
    this.PPData.set(data, 0);
    this.handlePostVisibility();
  }
  public static isPostProcessLDRUsedInFrame() {
    return this.postUsedInFrame.size > 0;
  }
  private static handlePostVisibility() {
    this.PPOptions.chromaticAberration!.str === 0
      ? this.postUsedInFrame.delete("chromaticAberration")
      : this.postUsedInFrame.add("chromaticAberration");
    this.PPOptions.vignette!.str === 0
      ? this.postUsedInFrame.delete("vignette")
      : this.postUsedInFrame.add("vignette");
  }

  public static getPostProcess() {
    return this.PPOptions;
  }
  private static getPipeline(name: PostName) {
    const pipeline = this.pipelines.get(name);
    assert(
      pipeline !== undefined,
      `bloom pipeline with name ${name} not found`
    );
    return pipeline;
  }
  private static getBuffer(name: PostName) {
    const buffer = this.buffers.get(name);
    assert(buffer !== undefined, `bloom pipeline with name ${name} not found`);
    return buffer;
  }

  private static generateBind(postName: PostName, textureName: string) {
    const buffer = this.getBuffer(postName);
    const sampler = Renderer.getSampler("linear");
    const bindData = Aurora.getNewBindGroupFromLayout(
      {
        label: `${postName}Bind`,
        entries: [
          {
            binding: 0,
            resource: sampler,
          },
          {
            binding: 1,
            resource: Renderer.getTextureView(textureName),
          },
          {
            binding: 2,
            resource: { buffer: buffer },
          },
        ],
      },
      this.layout
    );
    const dataPlacement = DATA_SIZES[postName];
    Aurora.device.queue.writeBuffer(
      buffer,
      0,
      this.PPData,
      dataPlacement.offset,
      dataPlacement.size
    );

    return bindData;
  }
}
