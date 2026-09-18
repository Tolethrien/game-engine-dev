import { assert, deepMerge } from "@axiom/utils";
import Engine from "@engine/engine";
import AssetManager from "./assetManager";
import {
  AuroraConfig,
  BASE_CONFIG,
  ChangeableRenderConfig,
  RenderRes,
} from "./config";
import { PipelineTargets } from "./pass";
import RenderGraph from "./renderGraph";
import ResourcePool from "./resourcePool";
import SharedBinds, { CameraData, GlobalBinding } from "./sharedBinds";
import GpuTimer from "./timer";
import { debug } from "@debug";
export interface RenderPipelineOptions {
  label: string;
  shader: string;
  buffers?: GPUVertexBufferLayout[];
  blend?: GPUBlendState;
  binds?: GPUBindGroupLayout;
  depth?: { write?: boolean; compare?: GPUCompareFunction };
  topology?: GPUPrimitiveTopology;
  cullMode?: GPUCullMode;
  vertexEntry?: string;
  fragmentEntry?: string;
  constants?: Record<string, number | boolean>;
}
export interface ComputePipelineOptions {
  label: string;
  shader: string;
  binds?: GPUBindGroupLayout;
  entry?: string;
}
export default class Aurora {
  public static adapter: GPUAdapter;
  public static device: GPUDevice;
  public static canvas: HTMLCanvasElement;
  public static context: GPUCanvasContext;
  private static lost = false;
  private static configured = false;
  private static pendingCanvasSize: Size2D | null = null;
  declare private static canvasFormat: GPUTextureFormat;
  private static settings: AuroraConfig = structuredClone(BASE_CONFIG);
  private static renderSize: Size2D = this.parseRes(
    BASE_CONFIG.rendering.renderRes,
  );
  private static pendingParameters: DeepPartial<ChangeableRenderConfig> | null =
    null;
  public static async init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("webgpu");
    assert(ctx !== null, "there is no WebGPU context in canvas");
    this.context = ctx;
    assert(
      navigator.gpu !== undefined,
      "WebGPU is not supported on this browser.",
    );
    const adapter = await navigator.gpu.requestAdapter();
    assert(adapter !== null, "Failed to get GPU adapter");
    this.adapter = adapter;
    this.device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],
    });
    debug.aurora.watchDevice(this.device);
    GpuTimer.init();
    SharedBinds.init();
    debug.aurora.connect(() => ({
      gpuTime: GpuTimer.getTime,
      steps: GpuTimer.getSteps,
      activePasses: RenderGraph.getActivePasses,
      textures: () => RenderGraph.describeResources(),
      poolTotal: () => ResourcePool.getTextureCount,
    }));
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: "opaque",
    });
    Engine.events.windowResize.connect(
      (size) => (this.pendingCanvasSize = size),
    );
  }

  public static async build() {
    assert(
      this.configured,
      "Aurora.config() must be called and awaited before the engine starts",
    );
    SharedBinds.buildFrame();
    await RenderGraph.build();
  }
  public static get getRenderSize() {
    return this.renderSize;
  }
  public static get getSettings(): DeepReadonly<AuroraConfig> {
    return this.settings;
  }
  public static get getGpuTime() {
    return GpuTimer.getTime;
  }
  public static get isLinear() {
    return this.settings.rendering.colorSpace === "linear";
  }
  public static colorChannel(value: number) {
    const channel = value / 255;
    if (!this.isLinear) return channel;
    if (channel <= 0.04045) return channel / 12.92;
    return ((channel + 0.055) / 1.055) ** 2.4;
  }
  public static get getCanvasFormat() {
    return this.canvasFormat;
  }
  public static addGlobal(global: GlobalBinding) {
    SharedBinds.addGlobal(global);
    if (RenderGraph.isBuilt) void RenderGraph.rebuild();
  }
  public static setCamera(camera: Partial<CameraData>) {
    SharedBinds.setCamera(camera);
  }
  public static beginFrame() {
    if (this.pendingCanvasSize !== null) {
      ResourcePool.clear("canvas");
      this.pendingCanvasSize = null;
    }

    if (this.pendingParameters !== null) {
      const previous = this.settings;
      this.settings = deepMerge<AuroraConfig>(
        this.settings,
        this.pendingParameters,
      );
      this.pendingParameters = null;

      if (this.settings.rendering.renderRes !== previous.rendering.renderRes) {
        this.renderSize = this.parseRes(this.settings.rendering.renderRes);
        ResourcePool.clear("render");
      }

      const color = this.settings.rendering.canvasColor;
      const previousColor = previous.rendering.canvasColor;
      if (color.some((value, i) => value !== previousColor[i])) {
        void RenderGraph.rebuild();
      }
    }
  }
  public static endFrame() {
    if (this.lost) return;
    SharedBinds.updateFrame();
    RenderGraph.execute();
    debug.aurora.endFrame();
  }

  public static stop() {
    this.device.destroy();
  }
  public static async config(props: DeepPartial<AuroraConfig>) {
    assert(
      !RenderGraph.isBuilt,
      "Aurora.config() can only be called before the engine starts, use Aurora.setParameter() instead",
    );
    const config = deepMerge(structuredClone(BASE_CONFIG), props);
    this.settings = config;
    this.renderSize = this.parseRes(config.rendering.renderRes);
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: config.rendering.transparentCanvas
        ? "premultiplied"
        : "opaque",
    });
    await Promise.all([
      AssetManager.setTextures({
        sources: this.settings.userTextures,
        normalMaps: this.settings.rendering.normalMaps,
        heightMaps: this.settings.rendering.heightMaps,
      }),
      AssetManager.setUITextures(this.settings.userUI),
      AssetManager.setFonts(this.settings.fonts, this.settings.fontAtlas),
    ]);
    SharedBinds.buildAssets();
    this.configured = true;
  }
  private static parseRes(res: RenderRes): Size2D {
    const [width, height] = res.split("x").map(Number);
    return { width, height };
  }
  public static setParameter(props: DeepPartial<ChangeableRenderConfig>) {
    this.pendingParameters = deepMerge(this.pendingParameters ?? {}, props);
  }

  public static createShader(label: string, code: string) {
    const module = this.device.createShaderModule({ label, code });
    debug.aurora.watchShader(label, module, code);
    return module;
  }
  public static createRenderPipeline(
    targets: PipelineTargets,
    {
      label,
      shader,
      buffers = [],
      blend,
      binds,
      depth,
      topology = "triangle-list",
      cullMode = "none",
      constants = {},
      vertexEntry = "vertexMain",
      fragmentEntry = "fragmentMain",
    }: RenderPipelineOptions,
  ) {
    assert(
      depth === undefined || targets.depth !== undefined,
      `Pipeline "${label}" has depth options, but its pass writes no depth texture`,
    );
    const module = this.createShader(`${label}Shader`, shader);
    const values: Record<string, number> = {};
    for (const name of Object.keys(constants)) {
      values[name] = Number(constants[name]);
    }

    return this.device
      .createRenderPipelineAsync({
        label: `${label}Pipeline`,
        layout: SharedBinds.pipelineLayout(`${label}PipelineLayout`, binds),
        vertex: { module, entryPoint: vertexEntry, buffers, constants: values },
        fragment:
          targets.colors.length === 0
            ? undefined
            : {
                module,
                entryPoint: fragmentEntry,
                targets: targets.colors.map((format) => ({ format, blend })),
                constants: values,
              },
        depthStencil:
          targets.depth === undefined
            ? undefined
            : {
                format: targets.depth,
                depthWriteEnabled: depth?.write ?? true,
                depthCompare: depth?.compare ?? "less-equal",
              },
        primitive: { topology, cullMode },
      })
      .then((pipeline) => {
        debug.aurora.watchPipeline(pipeline, topology);
        return pipeline;
      });
  }
  public static createComputePipeline({
    label,
    shader,
    binds,
    entry = "computeMain",
  }: ComputePipelineOptions) {
    const module = this.createShader(`${label}Shader`, shader);
    return this.device.createComputePipelineAsync({
      label: `${label}Pipeline`,
      layout: SharedBinds.pipelineLayout(`${label}PipelineLayout`, binds),
      compute: {
        module,
        entryPoint: entry,
        constants: { groupSize: this.settings.rendering.computeGroupSize },
      },
    });
  }

  public static dispatch(encoder: GPUComputePassEncoder, size: Size2D) {
    const groupSize = this.settings.rendering.computeGroupSize;
    encoder.dispatchWorkgroups(
      Math.ceil(size.width / groupSize),
      Math.ceil(size.height / groupSize),
    );
  }
}
