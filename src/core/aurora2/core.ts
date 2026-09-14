import { assert, deepMerge } from "../axiom/utils";
import Engine from "../engine/engine";
import {
  AuroraConfig,
  BASE_CONFIG,
  ChangeableRenderConfig,
  RenderRes,
} from "./config";
import RenderGraph from "./renderGraph";
import ResourcePool from "./resourcePool";
import GpuTimer from "./timer";
import { debug } from "@debug";
/**
 * core jest odpowiedzialny w sumie za start i caly graph
 * utils to beda wrappery webgpu
 *
 *
 */
export default class Aurora {
  public static adapter: GPUAdapter;
  public static device: GPUDevice;
  public static canvas: HTMLCanvasElement;
  public static context: GPUCanvasContext;
  public static readonly events = {};
  private static pendingCanvasSize: Size2D | null = null;
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
    GpuTimer.init();
    debug.aurora.connect(() => ({
      gpuTime: GpuTimer.getTime,
      passTimes: GpuTimer.getPassTimes,
      activePasses: RenderGraph.getActivePassNames,
      textures: ResourcePool.getTextureCount,
    }));
    debug.aurora.onCollectingChange((collecting) =>
      GpuTimer.setPerPass(collecting),
    );
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({
      device: this.device,
      format: format,
      alphaMode: "opaque",
    });

    Engine.events.windowResize.connect(
      (size) => (this.pendingCanvasSize = size),
    );
  }
  public static get getRenderSize() {
    return this.renderSize;
  }
  public static get getSettings() {
    return this.settings;
  }
  public static get getGpuTime() {
    return GpuTimer.getTime;
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
    }
  }
  public static endFrame() {
    RenderGraph.execute();
    debug.aurora.endFrame();
  }

  public static stop() {
    this.device.destroy();
  }
  public static async config(props: DeepPartial<AuroraConfig>) {
    const config = deepMerge(structuredClone(BASE_CONFIG), props);
    this.settings = config;
    this.renderSize = this.parseRes(config.rendering.renderRes);
    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: config.rendering.transparentCanvas
        ? "premultiplied"
        : "opaque",
    });
  }
  private static parseRes(res: RenderRes): Size2D {
    const [width, height] = res.split("x").map(Number);
    return { width, height };
  }
  public static setParameter(props: DeepPartial<ChangeableRenderConfig>) {
    this.pendingParameters = deepMerge(this.pendingParameters ?? {}, props);
  }
}
