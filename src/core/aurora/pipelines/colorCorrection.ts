import { PipelineBind } from "../aurora";
import Aurora from "../core";
import { AuroraConfig, ToneMapList } from "../renderer/config";
import Renderer from "../renderer/renderer";
import AuroraDebugInfo from "../debugger/debugInfo";
import colorShader from "../shaders/display/colorCorrection.wgsl?raw";
export interface ColorCorrectionOptions {
  exposure: number;
  saturation: number;
  contrast: number;
  whiteBalance: number;
  hueShift: number;
  brightness: number;
  invert: number;
  tint: RGBA;
}

export enum ScreenSettings {
  exposure,
  saturation,
  contrast,
  whiteBalance,
  hueShift,
  brightness,
  invert,
  padding,
  tint,
}
export default class ColorCorrection {
  private static uniformCorrection: GPUBuffer;
  private static textureBindLayout: PipelineBind[1];
  private static textureBind: PipelineBind[0];
  private static optionBind: PipelineBind;
  private static pipeline: GPUComputePipeline;
  private static groupSize: AuroraConfig["rendering"]["computeGroupSize"];
  private static options = new Float32Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);

  public static async createPipeline() {
    // this.addControl();
    const shader = Aurora.createShader("colorCorrectionShader", colorShader);
    this.uniformCorrection = Aurora.createBuffer({
      bufferType: "uniform",
      dataLength: 13,
      dataType: "Float32Array",
      label: "ColorCorrectionOptions",
    });
    this.textureBindLayout = Aurora.createBindLayout({
      label: "colorCorrectionBind",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { viewDimension: "2d" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { viewDimension: "2d" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: { viewDimension: "2d" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,

          storageTexture: {
            access: "write-only",
            format: "rgba16float",
            viewDimension: "2d",
          },
        },
      ],
    });
    this.generateBind();
    this.optionBind = Aurora.createBindGroup({
      label: "colorCorrectionOptionsBind",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          layout: { buffer: { type: "uniform" } },
          resource: { buffer: this.uniformCorrection },
        },
      ],
    });
    const [_, bloomParamsLayout] = Renderer.getBind("bloomParams");

    this.groupSize = Renderer.getConfigGroup("rendering").computeGroupSize;
    const pipelineLayout = Aurora.createPipelineLayout([
      this.textureBindLayout,
      this.optionBind[1],
      bloomParamsLayout,
    ]);
    this.pipeline = await Aurora.createComputePipeline({
      shader: shader,
      pipelineName: "colorCorrectionPipeline",
      pipelineLayout: pipelineLayout,
      consts: {
        workgroupSize: this.groupSize,
        toneMapping: ToneMapList[Renderer.getAllConfig.rendering.toneMapping],
      },
    });
  }

  public static usePipeline() {
    const commandEncoder = Renderer.getEncoder;
    const { meta } = Renderer.getTexture("finalDraw");
    const [bloomParams] = Renderer.getBind("bloomParams");
    const size = {
      x: Math.ceil(meta.width / this.groupSize),
      y: Math.ceil(meta.height / this.groupSize),
    };
    Aurora.device.queue.writeBuffer(this.uniformCorrection, 0, this.options, 0);
    const passEncoder = commandEncoder.beginComputePass({
      label: "colorCorrectionRenderPass",
      timestampWrites: AuroraDebugInfo.setTimestamp(
        "colorCorStart",
        "colorCorEnd"
      ),
    });
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.textureBind);
    passEncoder.setBindGroup(1, this.optionBind[0]);
    passEncoder.setBindGroup(2, bloomParams);
    passEncoder.dispatchWorkgroups(size.x, size.y);
    passEncoder.end();
    AuroraDebugInfo.accumulate("computeCalls", 1);
    AuroraDebugInfo.accumulate("computePasses", 1);
    AuroraDebugInfo.accumulate("pipelineInUse", ["ColorCorr"]);
  }
  public static clearPipeline() {}
  public static rebindPipeline() {
    this.generateBind();
  }
  public static get getAllScreenSettings() {
    const list: Partial<ColorCorrectionOptions & { padding: number }> = {};
    list["tint"] = [0, 0, 0, 0];
    const tintIndexStart = ScreenSettings["tint"];
    this.options.forEach((value, index) => {
      if (index >= tintIndexStart && index <= tintIndexStart + 4) {
        list["tint"]![index - tintIndexStart] = value;
        return;
      }
      const name = ScreenSettings[index] as keyof typeof ScreenSettings;
      list[name] = value as number & RGBA;
    });
    return list;
  }
  public static getScreenSetting(name: keyof typeof ScreenSettings) {
    return this.options[ScreenSettings[name]];
  }
  public static setScreenSettings(props: Partial<ColorCorrectionOptions>) {
    const tintIndex = ScreenSettings["tint"];
    Object.entries(props).forEach((entry) => {
      const index = ScreenSettings[entry[0] as keyof ColorCorrectionOptions];
      if (index === tintIndex) {
        const tint = entry[1] as RGBA;
        tint.forEach(
          (channel, index) => (this.options[tintIndex + index] = channel)
        );
        return;
      }
      this.options[index] = entry[1] as number;
    });
  }
  private static generateBind() {
    this.textureBind = Aurora.getNewBindGroupFromLayout(
      {
        label: "colorCorrectionBind",
        entries: [
          {
            binding: 0,
            resource: Renderer.getTextureView("offscreenCanvas"),
          },
          {
            binding: 1,
            resource: Renderer.getTextureView("lightMap"),
          },
          {
            binding: 2,
            resource: Renderer.getTextureView("bloomEffect"),
          },
          {
            binding: 3,
            resource: Renderer.getTextureView("finalDraw"),
          },
        ],
      },
      this.textureBindLayout
    );
  }
}
