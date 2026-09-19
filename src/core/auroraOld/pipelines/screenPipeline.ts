import { PipelineBind } from "../aurora";
import Aurora from "../core";
import Renderer from "../renderer/renderer";
import AuroraDebugInfo from "../debugger/debugInfo";
import screen from "../shaders/display/screenMixQuad.wgsl?raw";
import debug from "../shaders/display/debug.wgsl?raw";
import { ToneMapList } from "../renderer/config";

type displayMode = "screen" | "debug";
/**
 * final pass to show texture on screen
 */
export default class ScreenPipeline {
  private static displayScreenPipeline: GPURenderPipeline;
  private static displayDebugPipeline: GPURenderPipeline;
  private static displayDebugBindLayout: PipelineBind[1];
  private static displayScreenBindLayout: PipelineBind[1];
  private static displayMode: displayMode = "screen";
  private static displayedDebugTexture = "";
  private static currentBindData: PipelineBind[0];
  private static debugOptionsBuffer: GPUBuffer;
  private static bufferDirty = false;
  private static textureDirty = true;
  private static lastPostProcessState = false;
  public static clearPipeline() {
    this.textureDirty = true;
  }
  public static rebindPipeline() {
    this.textureDirty = true;
  }
  public static async createPipeline() {
    const normalShader = Aurora.createShader("screenShader", screen);
    const debugShader = Aurora.createShader("debugShader", debug);
    this.displayScreenBindLayout = Aurora.createBindLayout({
      label: "debugLayout",
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
          texture: { viewDimension: "2d" },
        },
      ],
    });
    this.displayDebugBindLayout = Aurora.createBindLayout({
      label: "debugLayout",
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

    const screenPipelineLayout = Aurora.createPipelineLayout([
      this.displayScreenBindLayout,
    ]);
    const debugPipelineLayout = Aurora.createPipelineLayout([
      this.displayDebugBindLayout,
    ]);
    this.displayScreenPipeline = await Aurora.createRenderPipeline({
      shader: normalShader,
      pipelineName: "PresentationPipeline",
      buffers: [],
      pipelineLayout: screenPipelineLayout,
    });
    this.displayDebugPipeline = await Aurora.createRenderPipeline({
      shader: debugShader,
      pipelineName: "PresentationPipeline",
      buffers: [],
      pipelineLayout: debugPipelineLayout,
    });

    this.debugOptionsBuffer = Aurora.createBuffer({
      label: "DebugOptionsBuffer",
      bufferType: "uniform",
      dataLength: 2,
      dataType: "Uint32Array",
    });
  }

  public static usePipeline(): void {
    this.generateBind();

    const indexBuffer = Renderer.getBuffer("index");
    const commandEncoder = Renderer.getEncoder;
    const pipeline =
      this.displayMode === "screen"
        ? this.displayScreenPipeline
        : this.displayDebugPipeline;
    const passEncoder = commandEncoder.beginRenderPass({
      label: "screenRenderPass",
      colorAttachments: [
        {
          view: Aurora.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      timestampWrites: AuroraDebugInfo.setTimestamp("screenStart", "totalEnd"),
    });
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, this.currentBindData);
    passEncoder.setIndexBuffer(indexBuffer, "uint32");
    passEncoder.drawIndexed(6, 1);
    passEncoder.end();
    AuroraDebugInfo.accumulate("drawCalls", 1);
    AuroraDebugInfo.accumulate("renderPasses", 1);
    AuroraDebugInfo.accumulate("pipelineInUse", [
      `display:${this.displayMode}`,
    ]);
  }
  public static setDisplayMode(mode: displayMode, texture: string) {
    this.displayMode = mode;
    this.displayedDebugTexture = texture;
    this.bufferDirty = true;
    this.textureDirty = true;
  }
  private static generateBind() {
    if (Renderer.usingPostProcess() !== this.lastPostProcessState)
      this.textureDirty = true;

    this.lastPostProcessState = Renderer.usingPostProcess();
    if (this.displayMode === "screen") this.generateScreenBind();
    else this.generateDebugBind();
  }
  private static generateScreenBind() {
    if (!this.textureDirty) return;
    const havePost = Renderer.usingPostProcess() ? "PostLDR" : "finalDraw";
    const bind = Aurora.getNewBindGroupFromLayout(
      {
        label: "screenBind",
        entries: [
          {
            binding: 0,
            resource: Renderer.getSampler("linear"),
          },
          {
            binding: 1,
            resource: Renderer.getTextureView(havePost),
          },
          {
            binding: 2,
            resource: Renderer.getTextureView("gui"),
          },
        ],
      },
      this.displayScreenBindLayout,
    );
    this.currentBindData = bind;
    this.textureDirty = false;
  }
  private static generateDebugBind() {
    if (!this.bufferDirty) return;
    const uniformData = new Uint32Array([0, 0]);
    const { meta } = Renderer.getTexture(this.displayedDebugTexture);
    if (meta.format === "r16float") {
      uniformData[0] = 1;
    } else if (meta.format === "rgba16float") {
      const toneMap = Renderer.getConfigGroup("rendering").toneMapping;
      uniformData[1] = ToneMapList[toneMap];
    }
    const bind = Aurora.getNewBindGroupFromLayout(
      {
        label: "debugBind",
        entries: [
          {
            binding: 0,
            resource: Renderer.getSampler("linear"),
          },
          {
            binding: 1,
            resource: Renderer.getTextureView(this.displayedDebugTexture),
          },
          {
            binding: 2,
            resource: { buffer: this.debugOptionsBuffer },
          },
        ],
      },
      this.displayDebugBindLayout,
    );
    this.currentBindData = bind;
    this.bufferDirty = false;

    Aurora.device.queue.writeBuffer(this.debugOptionsBuffer, 0, uniformData, 0);
  }
}
