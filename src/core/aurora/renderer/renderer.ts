import { GPUAuroraTexture, PipelineBind } from "../aurora";
import AuroraCamera from "../camera";
import {
  compileShaders,
  generateInternalBuffers,
  generateInternalSamplers,
  generateInternalTextures,
} from "./generators";
import { AuroraConfig, ChangeableRenderConfig, RenderRes } from "./config";
import { assert } from "../../../utils/utils";
import Aurora from "../core";
import FontGen from "./fontGen";
import SequentialDrawPipeline from "../pipelines/sequentialDraw";
import SortedDrawPipeline from "../pipelines/sortedDraw";
import LightsPipeline from "../pipelines/lights";
import AuroraDebugInfo from "../debugger/debugInfo";
import ColorCorrection, {
  ColorCorrectionOptions,
  ScreenSettings,
} from "../pipelines/colorCorrection";
import Bloom from "../pipelines/bloom";
import GuiPipeline from "../pipelines/gui";
import ScreenPipeline from "../pipelines/screenPipeline";
import PostProcessLDR, { PostLDR } from "../pipelines/postProcessLDR";
import dummyTexture from "../assets/dummy.png";

interface PipelineStaticClass {
  usePipeline(): void;
  clearPipeline?(): void;
  rebindPipeline?(): void;
  createPipeline(): void;
}

/**
 * wyszukaj po RESIZE gdzie trza zmienic
 */
type DrawPipeline = typeof SortedDrawPipeline | typeof SequentialDrawPipeline;
export default class Renderer {
  private static auroraConfig: AuroraConfig;
  private static buffers: Map<string, GPUBuffer>;
  private static textures: Map<string, GPUAuroraTexture>;
  private static userTextureIndexes: Map<string, number> = new Map();
  private static samplers: Map<string, GPUSampler>;
  private static shaders: Map<string, GPUShaderModule>;
  private static globalBindGroups: Map<string, PipelineBind> = new Map();
  private static userFonts: Map<string, FontGen> = new Map();
  private static pipelineOrder: Set<PipelineStaticClass> = new Set();
  private static frameEncoder: GPUCommandEncoder;
  private static drawPipelineRef: DrawPipeline;
  public static pipelinesUsedInFrame: Set<string> = new Set();
  private static currentRes: Size2D = { width: 0, height: 0 };
  private static resolutionDirty = false;
  public static async initialize(config: AuroraConfig) {
    this.auroraConfig = config;

    if (this.auroraConfig.debugger !== "none") AuroraDebugInfo.setWorking(true);

    this.buffers = generateInternalBuffers();
    this.generateGlobalBindGroups();
    this.currentRes = this.getCurrentResolution();
    this.textures = generateInternalTextures(
      this.currentRes,
      this.auroraConfig.bloom.numberOfPasses,
    );
    this.samplers = generateInternalSamplers();
    this.shaders = compileShaders();
    await this.uploadUserTextures();
    await this.uploadFonts();
    this.setPipelineOrder();
    const cameraBind = AuroraCamera.initialize(this.auroraConfig.camera);
    this.globalBindGroups.set("camera", cameraBind);
    AuroraCamera.update(this.getBuffer("cameraMatrix"));
    await this.createPipelines();
  }
  public static closeRenderer() {
    if (this.auroraConfig.debugger !== "none")
      AuroraDebugInfo.setWorking(false);
    this.clearPipelines();
    this.buffers.clear();
    this.textures.clear();
    this.userTextureIndexes.clear();
    this.samplers.clear();
    this.shaders.clear();
    this.globalBindGroups.clear();
    this.userFonts.clear();
    this.pipelinesUsedInFrame.clear();
    this.pipelineOrder.clear();
    this.currentRes = { width: 0, height: 0 };
  }
  public static async setRendererSettings(config: ChangeableRenderConfig) {
    Object.entries(config).forEach((category) => {
      const categoryName = category[0] as keyof ChangeableRenderConfig;
      const categoryData = category[1] as Object;
      if (categoryName === "feature")
        this.reevaluateFeatures(categoryData as AuroraConfig["feature"]);
      else if (categoryName === "render")
        this.reevaluateRender(categoryData as AuroraConfig["rendering"]);
    });
  }

  public static beginBatch() {
    if (this.resolutionDirty) this.changeRenderResolution();
    this.frameEncoder = Aurora.device.createCommandEncoder();
    this.clearPipelines();
  }
  public static endBatch() {
    AuroraCamera.update(this.getBuffer("cameraMatrix"));
    if (this.resolutionDirty) return;
    this.startPipelines();

    const debugOn = AuroraDebugInfo.isWorking;
    if (debugOn) this.updateQuery();
    Aurora.device.queue.submit([this.frameEncoder.finish()]);
    if (debugOn) this.updateDebugData();
  }

  private static setPipelineOrder() {
    const config = this.auroraConfig;
    const drawPipeline =
      config.rendering.sortOrder === "none"
        ? SequentialDrawPipeline
        : SortedDrawPipeline;
    this.drawPipelineRef = drawPipeline;
    this.pipelineOrder.add(drawPipeline);
    this.pipelineOrder.add(LightsPipeline);
    this.pipelineOrder.add(Bloom);
    this.pipelineOrder.add(ColorCorrection);
    this.pipelineOrder.add(PostProcessLDR);
    this.pipelineOrder.add(GuiPipeline);
    this.pipelineOrder.add(ScreenPipeline);
  }

  private static clearPipelines() {
    this.pipelineOrder.forEach((pipeline) => pipeline.clearPipeline?.());
  }
  private static startPipelines() {
    this.pipelineOrder.forEach((pipeline) => pipeline.usePipeline());
  }
  private static rebindPipelines() {
    this.pipelineOrder.forEach((pipeline) => pipeline.rebindPipeline?.());
  }
  private static async createPipelines() {
    try {
      await Promise.all(
        Array.from(this.pipelineOrder).map((pipe) => pipe.createPipeline()),
      );
    } catch (error) {
      throw new Error(`error while creating pipelines: ${error}`);
    }
  }
  private static reevaluateFeatures(config: AuroraConfig["feature"]) {
    const textures = {
      bloom: Bloom,
      lighting: LightsPipeline,
    };
    Object.entries(config).forEach((feature) => {
      const featureName = feature[0] as keyof AuroraConfig["feature"];
      const featureValue = feature[1];
      if (this.auroraConfig.feature[featureName] === featureValue) return;
      this.auroraConfig.feature[featureName] = featureValue;
      textures[featureName].markToChange(featureValue);
    });
  }
  private static async reevaluateRender(config: AuroraConfig["rendering"]) {
    Object.entries(config).forEach((feature) => {
      const featureName = feature[0] as keyof AuroraConfig["rendering"];
      const featureValue = feature[1];
      if (this.auroraConfig.rendering[featureName] === featureValue) return;
      if (featureName === "renderRes") {
        this.resolutionDirty = true;
        const newRes = (featureValue as string).split("x");
        const resValues = {
          width: Number(newRes[0]),
          height: Number(newRes[1]),
        };
        const error = `Trying to change resolution but w:${resValues.width} or h:${resValues.height} is NaN`;
        assert(!Number.isNaN(resValues.width), error);
        assert(!Number.isNaN(resValues.height), error);
        this.resolutionDirty = true;
        this.auroraConfig.rendering.renderRes = featureValue as RenderRes;
        this.currentRes = resValues;
        this.changeRenderResolution();
      }
    });
  }

  public static copyTextureToTexture(src: string, destination: string) {
    const { meta, texture } = this.getTexture(src);
    const emptyTexture = this.getTexture(destination).texture;

    this.frameEncoder.copyTextureToTexture(
      { texture: texture },
      { texture: emptyTexture },
      { width: meta.width, height: meta.height, depthOrArrayLayers: 1 },
    );
  }
  public static async changeGUIResolution() {
    //TODO: only for now, will change in graph renderer
    this.changeRenderResolution();
  }
  private static async changeRenderResolution() {
    const newRes = this.currentRes;
    const userTextures = this.getTexture("userTexture");
    this.textures = generateInternalTextures(
      newRes,
      this.auroraConfig.bloom.numberOfPasses,
    );
    this.textures.set("userTexture", userTextures);
    this.rebindPipelines();
    this.resolutionDirty = false;
  }
  private static async uploadUserTextures() {
    this.auroraConfig.userTextures.forEach((texture, index) => {
      this.userTextureIndexes.set(texture.name, index);
    });
    const userTexture = await Aurora.createTextureArray({
      label: "userTextures",
      textures: this.auroraConfig.userTextures,
      format: "bgra8unorm",
    });
    this.textures.set("userTexture", userTexture);
    const userTextureBind = Aurora.createBindGroup({
      label: "userTextureBind",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          layout: { sampler: {} },
          resource: this.getSampler("universal"),
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          layout: { texture: { viewDimension: "2d-array" } },
          resource: userTexture.texture.createView(),
        },
      ],
    });
    this.globalBindGroups.set("userTextures", userTextureBind);
  }
  public static async reuploadUserTextures(
    textures: { url: string; name: string }[],
  ) {
    this.auroraConfig.userTextures = [];
    this.userTextureIndexes.clear();
    this.auroraConfig.userTextures.push({
      name: "colorRect",
      url: dummyTexture,
    });
    this.userTextureIndexes.set("dummy", 0);

    textures.forEach((texture, index) => {
      this.userTextureIndexes.set(texture.name, index + 1);
      this.auroraConfig.userTextures.push(texture);
    });

    const userTexture = await Aurora.createTextureArray({
      label: "userTextures",
      textures: this.auroraConfig.userTextures,
      format: "bgra8unorm",
    });
    this.textures.set("userTexture", userTexture);
    const userTextureBind = Aurora.createBindGroup({
      label: "userTextureBind",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          layout: { sampler: {} },
          resource: this.getSampler("universal"),
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          layout: { texture: { viewDimension: "2d-array" } },
          resource: userTexture.texture.createView(),
        },
      ],
    });
    this.globalBindGroups.set("userTextures", userTextureBind);
    this.drawPipelineRef.createPipeline();
  }
  private static async uploadFonts() {
    let index = 0;
    for (const { img, json, fontName } of this.auroraConfig.userFonts) {
      const font = await FontGen.generateFont({
        fontName,
        img,
        json,
        index,
      });
      this.userFonts.set(fontName, font);
      index++;
    }
    const textures = Array.from(this.userFonts.values()).map((text) => {
      const data = text.getFontGenerationInfo;
      return {
        url: data.imgUrl,
        name: data.name,
      };
    });
    const texture = await Aurora.createTextureArray({
      label: `MSDF font texture array`,
      format: "rgba8unorm",
      textures: textures,
    });
    const FontBind = Aurora.createBindGroup({
      label: `fontArrayBind`,
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          layout: { sampler: {} },
          resource: this.getSampler("fontGen"),
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          layout: { texture: { viewDimension: "2d-array" } },
          resource: texture.texture.createView(),
        },
      ],
    });
    this.globalBindGroups.set("fonts", FontBind);
  }
  private static updateQuery() {
    const { qRead, qSet, qWrite, count } = AuroraDebugInfo.getQuery();
    this.frameEncoder.resolveQuerySet(qSet, 0, count, qWrite, 0);
    if (qRead.mapState === "unmapped") {
      this.frameEncoder.copyBufferToBuffer(qWrite, 0, qRead, 0, qRead.size);
    }
  }
  private static updateDebugData() {
    const { qRead } = AuroraDebugInfo.getQuery();

    if (qRead.mapState === "unmapped") {
      qRead.mapAsync(GPUMapMode.READ).then(() => {
        const times = new BigInt64Array(qRead.getMappedRange());
        AuroraDebugInfo.updateTimes(times);
        qRead.unmap();
      });
    }
    const { drawnQuads, drawnLights, drawCalls, computeCalls, drawnGui } =
      AuroraDebugInfo.getAllData;
    AuroraDebugInfo.setParam(
      "drawnTriangles",
      drawnQuads * 2 + drawnLights * 2 + drawnGui * 2,
    );
    AuroraDebugInfo.setParam(
      "drawnVertices",
      drawnQuads * 2 * 6 + drawnLights * 2 * 6 + drawnGui * 6,
    );
    AuroraDebugInfo.setParam("totalCalls", drawCalls + computeCalls);
  }
  private static generateGlobalBindGroups() {
    //TODO: to przerobic, dodac tonemap do uniwersalnego i usunac ta funkcje
    const bloomParamsUniform = Aurora.createBindGroup({
      label: "BloomParamsBind",
      entries: [
        {
          binding: 0,
          layout: { buffer: { type: "uniform" } },
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
          resource: { buffer: this.getBuffer("bloomParams") },
        },
      ],
    });
    const viewportUniform = Aurora.createBindGroup({
      label: "viewportUniformBind",
      entries: [
        {
          binding: 2,
          layout: { buffer: { type: "uniform" } },
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          resource: { buffer: this.getBuffer("viewport") },
        },
      ],
    });
    this.globalBindGroups.set("bloomParams", bloomParamsUniform);
    this.globalBindGroups.set("viewport", viewportUniform);
  }
  public static getBuffer(name: string) {
    const buffer = this.buffers.get(name);
    assert(buffer !== undefined, this.showNotFoundInMapError(name, "buffer"));
    return buffer;
  }

  public static getSampler(name: string) {
    const sampler = this.samplers.get(name);
    assert(sampler !== undefined, this.showNotFoundInMapError(name, "sampler"));
    return sampler;
  }
  public static getShader(name: string) {
    const shader = this.shaders.get(name);
    assert(shader !== undefined, this.showNotFoundInMapError(name, "shader"));
    return shader;
  }
  public static getBind(name: string) {
    const bind = this.globalBindGroups.get(name);
    assert(bind !== undefined, this.showNotFoundInMapError(name, "bind"));
    return bind;
  }
  public static getTexture(name: string) {
    const texture = this.textures.get(name);
    assert(texture !== undefined, this.showNotFoundInMapError(name, "texture"));
    return texture;
  }
  public static getTextureView(name: string, mipLevel = 0) {
    const texture = this.textures.get(name);
    assert(texture !== undefined, this.showNotFoundInMapError(name, "texture"));

    return texture.texture.createView({
      mipLevelCount: 1,
      baseMipLevel: mipLevel,
    });
  }
  public static getCurrentResolution(): Size2D {
    const stringRes = this.auroraConfig.rendering.renderRes;
    const renderRes = stringRes.split("x");
    assert(
      renderRes.length === 2,
      `problem with resolving resolution ${stringRes}, there are no two values split by "x"`,
    );
    let renderWidth = Number(renderRes[0]);
    let renderHeight = Number(renderRes[1]);
    assert(typeof renderWidth === "number", `width:${renderWidth} is NaN`);
    assert(typeof renderHeight === "number", `height:${renderWidth} is NaN`);
    return { width: renderWidth, height: renderHeight };
  }
  public static get getAllScreenSettings() {
    return ColorCorrection.getAllScreenSettings;
  }
  public static getScreenSetting(name: keyof typeof ScreenSettings) {
    return ColorCorrection.getScreenSetting(name);
  }
  public static setScreenSettings(settings: Partial<ColorCorrectionOptions>) {
    return ColorCorrection.setScreenSettings(settings);
  }
  public static setPostProcess(settings: PostLDR) {
    return PostProcessLDR.setPostProcess(settings);
  }
  public static getPostProcess() {
    return PostProcessLDR.getPostProcess();
  }
  public static usingPostProcess() {
    return PostProcessLDR.isPostProcessLDRUsedInFrame();
  }
  public static get getEncoder() {
    return this.frameEncoder;
  }
  public static getTextureIndex(name: string) {
    const texture = this.userTextureIndexes.get(name);

    if (!texture)
      console.warn(
        `WARNING: No texture with name ${name} present in Batcher! fallback to color`,
      );
    return texture ?? 0;
  }
  public static getUserFontData(fontName: string) {
    const font = this.userFonts.get(fontName);
    assert(font !== undefined, `there is no userFont with name ${fontName}`);
    return font;
  }
  public static getDrawPipeline() {
    return this.drawPipelineRef;
  }

  public static get getGlobalIllumination(): RGB {
    return LightsPipeline.getGlobalIllumination();
  }
  public static setGlobalIllumination(color: RGB) {
    LightsPipeline.setGlobalIllumination(color);
  }
  public static get getAllConfig() {
    return this.auroraConfig;
  }
  public static getConfigGroup<T extends keyof AuroraConfig>(option: T) {
    return this.auroraConfig[option];
  }

  private static showNotFoundInMapError(name: string, mapType: string) {
    return `trying access ${mapType} ${name}, but ${mapType} with this name not exist`;
  }
}
