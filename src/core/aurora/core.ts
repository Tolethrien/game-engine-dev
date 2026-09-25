import { assert, deepMerge } from "@axiom/utils";
import AxiomMath from "@axiom/math";
import Engine from "@engine/engine";
import AssetManager from "./assetManager";
import {
  AuroraConfig,
  BASE_CONFIG,
  ChangeableRenderConfig,
  RENDER,
} from "./config";
import type { PipelineTargets } from "./pass";
import RenderGraph from "./renderGraph";
import Material from "./material";
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
  // both follow the canvas aspect, set in init and whenever the canvas or the quality changes
  private static renderSize: Size2D = { width: 1, height: 1 };
  private static viewSize: Size2D = { width: 1, height: 1 };
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
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    assert(adapter !== null, "Failed to get GPU adapter");
    this.adapter = adapter;
    this.device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],
    });
    debug.aurora.watchDevice(this.device, adapter);
    GpuTimer.init();
    SharedBinds.init();
    debug.aurora.connect(() => ({
      steps: GpuTimer.getSteps,
      activePasses: RenderGraph.getActivePasses,
      textures: () => RenderGraph.describeResources(),
      pool: () => ResourcePool.getPoolTextures,
      settings: () => this.settings,
      renderSize: () => this.renderSize,
      canvas: () => ({
        width: this.canvas.width,
        height: this.canvas.height,
        format: this.canvasFormat,
      }),
      materials: () => Material.getAll,
      preset: () => RenderGraph.getPreset,
      setParameter: (props) => this.setParameter(props),
      camera: () => this.getCamera,
      setCamera: (camera) => this.setCamera(camera),
    }));
    this.resolveSizes();
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
  // world units the view shows at zoom 1
  public static get getViewSize() {
    return this.viewSize;
  }
  // render texels per world unit at zoom 1
  public static get getRenderScale() {
    return this.renderSize.height / this.settings.camera.viewHeight;
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
  public static toTargetColor([
    red,
    green,
    blue,
    alpha,
  ]: Readonly<RGBA>): GPUColor {
    const unit = alpha / 255;
    return [
      this.colorChannel(red) * unit,
      this.colorChannel(green) * unit,
      this.colorChannel(blue) * unit,
      unit,
    ];
  }
  // canvas holds already encoded srgb, so it is not linearized
  public static toCanvasColor([
    red,
    green,
    blue,
    alpha,
  ]: Readonly<RGBA>): GPUColor {
    const unit = alpha / 255;
    return [
      (red / 255) * unit,
      (green / 255) * unit,
      (blue / 255) * unit,
      unit,
    ];
  }
  public static get getCanvasFormat() {
    return this.canvasFormat;
  }
  public static addGlobal(global: GlobalBinding) {
    SharedBinds.addGlobal(global);
    if (RenderGraph.isBuilt) void RenderGraph.rebuild();
  }
  public static get getCamera(): CameraData {
    return SharedBinds.getCamera;
  }
  public static setCamera(camera: Partial<CameraData>) {
    SharedBinds.setCamera(camera);
  }
  // canvas pixels (mouse position) of a world point, through the camera without its texel snap
  public static worldToScreen({ x, y }: Position2D): Position2D {
    const camera = SharedBinds.getViewCamera;
    let right = (x - camera.x) * camera.scale;
    let down = (y - camera.y) * camera.scale;
    if (camera.rotation !== 0) {
      const cos = Math.cos(camera.rotation);
      const sin = Math.sin(camera.rotation);
      [right, down] = [right * cos - down * sin, right * sin + down * cos];
    }
    const render = this.renderSize;
    return {
      x: ((right + Math.floor(render.width / 2)) * this.canvas.width) / render.width,
      y: ((down + Math.floor(render.height / 2)) * this.canvas.height) / render.height,
    };
  }
  public static screenToWorld({ x, y }: Position2D): Position2D {
    const camera = SharedBinds.getViewCamera;
    const render = this.renderSize;
    let right = (x * render.width) / this.canvas.width - Math.floor(render.width / 2);
    let down = (y * render.height) / this.canvas.height - Math.floor(render.height / 2);
    if (camera.rotation !== 0) {
      const cos = Math.cos(camera.rotation);
      const sin = Math.sin(camera.rotation);
      [right, down] = [right * cos + down * sin, down * cos - right * sin];
    }
    return { x: right / camera.scale + camera.x, y: down / camera.scale + camera.y };
  }
  public static beginFrame() {
    if (this.pendingCanvasSize !== null) {
      ResourcePool.clear("canvas");
      this.pendingCanvasSize = null;
      if (this.resolveSizes()) ResourcePool.clear("render");
    }

    if (this.pendingParameters !== null) {
      const previous = this.settings;
      this.settings = deepMerge<AuroraConfig>(
        this.settings,
        this.pendingParameters,
      );
      this.pendingParameters = null;

      const { renderRes, renderScale } = this.settings.rendering;
      const quality =
        renderRes !== previous.rendering.renderRes ||
        renderScale !== previous.rendering.renderScale;
      if (quality && this.resolveSizes()) ResourcePool.clear("render");

      const color = this.settings.rendering.canvasColor;
      const previousColor = previous.rendering.canvasColor;
      if (color.some((value, i) => value !== previousColor[i])) {
        void RenderGraph.rebuild();
      }
    }
    RenderGraph.beginFrame();
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
    this.assertParameters(props);
    assert(
      props.camera?.viewHeight === undefined || props.camera.viewHeight > 0,
      `camera.viewHeight must be above 0, got ${props.camera?.viewHeight}`,
    );
    const config = deepMerge(structuredClone(BASE_CONFIG), props);
    this.settings = config;
    this.resolveSizes();
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
  // true when the render size changed; a minimized window keeps the last sizes
  private static resolveSizes() {
    const { width: canvasWidth, height: canvasHeight } = this.canvas;
    if (canvasWidth === 0 || canvasHeight === 0) return false;
    const aspect = canvasWidth / canvasHeight;
    const { renderRes, renderScale } = this.settings.rendering;
    const base =
      renderRes === "native" ? canvasHeight : RENDER.heights[renderRes];
    const limit = this.device.limits.maxTextureDimension2D;
    const height = Math.round(
      AxiomMath.clamp(
        base * renderScale,
        RENDER.minHeight,
        Math.min(limit, limit / aspect),
      ),
    );
    const width = Math.max(Math.round(height * aspect), 1);
    const viewHeight = this.settings.camera.viewHeight;
    this.viewSize = { width: viewHeight * aspect, height: viewHeight };
    if (width === this.renderSize.width && height === this.renderSize.height)
      return false;
    this.renderSize = { width, height };
    return true;
  }
  public static setParameter(props: DeepPartial<ChangeableRenderConfig>) {
    this.assertParameters(props);
    this.pendingParameters = deepMerge(this.pendingParameters ?? {}, props);
  }
  private static assertParameters(
    props: DeepPartial<ChangeableRenderConfig>,
  ) {
    const { gamma, renderScale } = props.rendering ?? {};
    assert(
      gamma === undefined || gamma > 0,
      `rendering.gamma must be above 0, got ${gamma}`,
    );
    assert(
      renderScale === undefined ||
        (renderScale >= RENDER.scale.min && renderScale <= RENDER.scale.max),
      `rendering.renderScale must be ${RENDER.scale.min}..${RENDER.scale.max}, got ${renderScale}`,
    );
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

  // groups are groupSize x groupSize x 1, so depth counts whole slices
  public static dispatch(
    encoder: GPUComputePassEncoder,
    size: Size2D,
    depth = 1,
  ) {
    const groupSize = this.settings.rendering.computeGroupSize;
    encoder.dispatchWorkgroups(
      Math.ceil(size.width / groupSize),
      Math.ceil(size.height / groupSize),
      depth,
    );
  }
}
