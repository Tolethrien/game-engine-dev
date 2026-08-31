import { assert } from "../../../utils/utils";
import Aurora from "../core";
import AuroraDebugInfo from "../debugger/debugInfo";
import Renderer from "../renderer/renderer";
import bloomX from "../shaders/post/bloom/downscaleXPass.wgsl?raw";
import bloomY from "../shaders/general/gaussianY.wgsl?raw";
import upscaleAndBlend from "../shaders/post/bloom/upscaleAndBlend.wgsl?raw";
import threshold from "../shaders/post/bloom/bloomThreshold.wgsl?raw";
import upscale from "../shaders/general/upscale.wgsl?raw";
enum BloomParamsEnum {
  threshold,
  knee,
  intense,
  numberOfPasses,
}
export default class Bloom {
  private static bloomOptions = new Float32Array([0, 0, 0, 0]);
  private static bindList: Map<string, GPUBindGroup> = new Map();
  private static bindLayouts: Map<string, GPUBindGroupLayout> = new Map();
  private static pipelines: Map<string, GPUComputePipeline> = new Map();
  private static orderList: string[] = [];
  private static groupSIze = 8;
  private static DEBUG = false;
  private static isEnable = true;
  private static needCleanup = false;

  public static async createPipeline() {
    this.isEnable = Renderer.getConfigGroup("feature").lighting;
    this.groupSIze = Renderer.getConfigGroup("rendering").computeGroupSize;
    const config = Renderer.getConfigGroup("bloom");
    Object.entries(config).forEach((entry) => {
      this.bloomOptions[
        BloomParamsEnum[entry[0] as keyof typeof BloomParamsEnum]
      ] = entry[1];
    });

    this.generateLayouts();
    this.generateBinds();
    await this.createPipelines();
  }

  public static usePipeline() {
    if (!this.isEnable) return;
    const commandEncoder = Renderer.getEncoder;
    const bloomParamBuffer = Renderer.getBuffer("bloomParams");
    Aurora.device.queue.writeBuffer(bloomParamBuffer, 0, this.bloomOptions, 0);

    const [bloomParams] = Renderer.getBind("bloomParams");
    let currentMip = 0;

    const passEncoder = commandEncoder.beginComputePass({
      label: `bloomPass`,
      timestampWrites: AuroraDebugInfo.setTimestamp("bloomStart", "bloomEnd"),
    });
    this.orderList.forEach((passName, index) => {
      const size = this.getGroupSize(passName, currentMip);
      const pipeline = this.getPipeline(passName);
      const bindData = this.getBind(`${passName}-${currentMip}`);
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindData);
      passEncoder.setBindGroup(1, bloomParams);
      passEncoder.dispatchWorkgroups(size.x, size.y);
      AuroraDebugInfo.accumulate("computeCalls", 1);
      if (passName === "y" && this.orderList[index + 1] === "x") currentMip++;
      if (passName === "upscale") currentMip--;
    });
    passEncoder.end();
    AuroraDebugInfo.accumulate("computePasses", 1);
    AuroraDebugInfo.accumulate("usedPostProcessing", ["bloom"]);
  }

  public static clearPipeline() {
    if (this.needCleanup) this.cleanTexture();
  }
  public static rebindPipeline() {
    this.generateBinds();
  }
  public static markToChange(enable: boolean) {
    if (enable) this.isEnable = true;
    else {
      this.needCleanup = true;
      this.isEnable = false;
    }
  }
  private static cleanTexture() {
    const commandEncoder = Renderer.getEncoder;

    const passEncoder = commandEncoder.beginRenderPass({
      label: "BloomClearRenderPass",
      colorAttachments: [
        {
          view: Renderer.getTextureView("bloomEffect"),
          clearValue: [0, 0, 0, 0],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    passEncoder.end();
    this.needCleanup = false;
  }
  private static getGroupSize(passName: string, mip: number) {
    let textureName: string;
    let saveMip: number = mip;
    if (passName === "threshold" || passName === "bloomPresent") {
      textureName = "bloomThreshold";
    } else textureName = "bloomXPass";
    if (passName === "upscale") saveMip -= 1;
    const { meta } = Renderer.getTexture(textureName);

    const width = Math.max(1, Math.floor(meta.width / (1 << saveMip)));
    const height = Math.max(1, Math.floor(meta.height / (1 << saveMip)));
    return {
      x: Math.ceil(width / this.groupSIze),
      y: Math.ceil(height / this.groupSIze),
    };
  }
  private static generateBinds() {
    this.thresholdBind();
    const passes = this.bloomOptions[BloomParamsEnum["numberOfPasses"]];
    for (let i = 0; i < passes * 2; i++) {
      this.createDownscaleBindFromLayout(i);
    }
    for (let i = passes - 1; i > 0; i--) {
      this.createUpscaleBindFromLayout(i);
    }
    this.createPresentationBind();
  }
  private static createDownscaleBindFromLayout(index: number) {
    const mipLevel = Math.floor(index / 2);
    const pass = Math.floor(
      (index / this.bloomOptions[BloomParamsEnum["numberOfPasses"]]) * 2
    );
    let input: GPUTextureView;
    let output: GPUTextureView;
    if (index % 2 === 0) {
      const textureToUse = index === 0 ? "bloomThreshold" : "bloomYPass";
      const inputMip = index === 0 ? 1 : mipLevel;
      input = Renderer.getTextureView(textureToUse, inputMip - 1);
      output = Renderer.getTextureView("bloomXPass", mipLevel);
      const layout = this.getLayout("x");
      const bind = Aurora.getNewBindGroupFromLayout(
        {
          label: `bloomBindXPass:${index}`,
          entries: [
            {
              binding: 0,
              resource: input,
            },
            {
              binding: 1,
              resource: output,
            },
            {
              binding: 2,
              resource: Renderer.getSampler("linear"),
            },
          ],
        },
        layout
      );
      this.bindList.set(`x-${mipLevel}`, bind);
      this.orderList.push("x");
      this.log(
        `PassX: input:${textureToUse}-mip:${
          inputMip - 1
        } => output:bloomXPass-mip:${mipLevel}`
      );
    } else {
      const layout = this.getLayout("y");
      input = Renderer.getTextureView("bloomXPass", pass);
      output = Renderer.getTextureView("bloomYPass", pass);
      const bind = Aurora.getNewBindGroupFromLayout(
        {
          label: `bloomBindXPass:${index}`,
          entries: [
            {
              binding: 0,
              resource: input,
            },
            {
              binding: 1,
              resource: output,
            },
          ],
        },
        layout
      );
      this.bindList.set(`y-${mipLevel}`, bind);
      this.orderList.push("y");

      this.log(
        `PassY: input:bloomXPass-mip:${mipLevel} => output:bloomYPass-mip:${mipLevel}`
      );
    }
  }
  private static createUpscaleBindFromLayout(passIndex: number) {
    const layout = this.getLayout("upscale");

    const isFirstUpscale =
      passIndex === this.bloomOptions[BloomParamsEnum["numberOfPasses"]] - 1;
    let inputOne: GPUTextureView = Renderer.getTextureView(
      isFirstUpscale ? "bloomYPass" : "bloomXPass",
      passIndex
    );
    let inputTwo: GPUTextureView = Renderer.getTextureView(
      "bloomYPass",
      passIndex - 1
    );
    let output: GPUTextureView = Renderer.getTextureView(
      "bloomXPass",
      passIndex - 1
    );
    const bind = Aurora.getNewBindGroupFromLayout(
      {
        label: `bloomUpscaleBindPass:${passIndex}`,
        entries: [
          {
            binding: 0,
            resource: inputOne,
          },
          {
            binding: 1,
            resource: inputTwo,
          },
          {
            binding: 2,
            resource: output,
          },
          {
            binding: 3,
            resource: Renderer.getSampler("linear"),
          },
        ],
      },
      layout
    );
    this.bindList.set(`upscale-${passIndex}`, bind);
    this.orderList.push("upscale");
    this.log(
      `upscale: inputs:(bloom${
        isFirstUpscale ? "Y" : "X"
      }Pass-mip${passIndex},bloomYPass-mip${
        passIndex - 1
      } ) => output:bloomXPass-mip:${passIndex - 1}`
    );
  }
  private static createPresentationBind() {
    const bind = Aurora.createBindGroup({
      label: "bloomPresentationBind",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          layout: {
            texture: {
              sampleType: "float",
              viewDimension: "2d",
            },
          },
          resource: Renderer.getTextureView("bloomXPass", 0),
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          layout: {
            storageTexture: {
              format: "rgba16float",
              access: "write-only",
            },
          },
          resource: Renderer.getTextureView("bloomEffect"),
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          layout: { sampler: { type: "filtering" } },
          resource: Renderer.getSampler("linear"),
        },
      ],
    });

    this.bindLayouts.set("bloomPresent", bind[1]);
    this.bindList.set("bloomPresent-0", bind[0]);
    this.orderList.push("bloomPresent");
    this.log(`present: input:bloomX-mip:0 => finalBloom-mip:0`);
  }
  private static generateLayouts() {
    const xPass = Aurora.createBindLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { viewDimension: "2d", sampleType: "float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            viewDimension: "2d",
            access: "write-only",
            format: "rgba16float",
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: "filtering" },
        },
      ],
      label: "bloomPassXBindLayout",
    });
    const yPass = Aurora.createBindLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { viewDimension: "2d", sampleType: "unfilterable-float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            viewDimension: "2d",
            access: "write-only",
            format: "rgba16float",
          },
        },
      ],
      label: "bloomPassYBindLayout",
    });
    const upscalePass = Aurora.createBindLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { viewDimension: "2d", sampleType: "float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { viewDimension: "2d", sampleType: "float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            viewDimension: "2d",
            access: "write-only",
            format: "rgba16float",
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: "filtering" },
        },
      ],
      label: "bloomPassDownscaleBindLayout",
    });
    this.bindLayouts.set("x", xPass);
    this.bindLayouts.set("y", yPass);
    this.bindLayouts.set("upscale", upscalePass);
  }
  private static thresholdBind() {
    const bind = Aurora.createBindGroup({
      label: "bloomThresholdBind",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          layout: {
            texture: {
              sampleType: "float",
              viewDimension: "2d",
            },
          },
          resource: Renderer.getTextureView("offscreenCanvas"),
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          layout: {
            storageTexture: {
              format: "rgba16float",
              access: "write-only",
            },
          },
          resource: Renderer.getTextureView("bloomThreshold"),
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          layout: { sampler: { type: "filtering" } },
          resource: Renderer.getSampler("linear"),
        },
      ],
    });

    this.bindLayouts.set("threshold", bind[1]);
    this.bindList.set("threshold-0", bind[0]);
    this.orderList.push("threshold");
    this.log(`Pass: getThreshold`);
  }
  private static async createPipelines() {
    const bloomXShader = Aurora.createShader("bloomX", bloomX);
    const bloomYShader = Aurora.createShader("bloomY", bloomY);
    const upAndBlend = Aurora.createShader("upscaleAndBlend", upscaleAndBlend);
    const upscaleShader = Aurora.createShader("upscale", upscale);
    const thresholdShader = Aurora.createShader("threshold", threshold);
    const [_, paramsLayout] = Renderer.getBind("bloomParams");
    const treshLayout = Aurora.createPipelineLayout([
      this.getLayout("threshold"),
      paramsLayout,
    ]);
    const presentLayout = Aurora.createPipelineLayout([
      this.getLayout("bloomPresent"),
    ]);
    const pipelineXLayout = Aurora.createPipelineLayout([this.getLayout("x")]);
    const pipelineYLayout = Aurora.createPipelineLayout([this.getLayout("y")]);
    const pipelineUpScaleLayout = Aurora.createPipelineLayout([
      this.getLayout("upscale"),
      paramsLayout,
    ]);

    const pipelineX = await Aurora.createComputePipeline({
      shader: bloomXShader,
      pipelineName: "bloomXPassPipeline",
      pipelineLayout: pipelineXLayout,
      consts: {
        workgroupSize: this.groupSIze,
      },
    });
    const pipelineY = await Aurora.createComputePipeline({
      shader: bloomYShader,
      pipelineName: "bloomYPassPipeline",
      pipelineLayout: pipelineYLayout,
      consts: {
        workgroupSize: this.groupSIze,
      },
    });

    const upscalePipeline = await Aurora.createComputePipeline({
      shader: upAndBlend,
      pipelineName: "bloomUpscalePassPipeline",
      pipelineLayout: pipelineUpScaleLayout,
      consts: {
        workgroupSize: this.groupSIze,
      },
    });
    const thresholdPipeline = await Aurora.createComputePipeline({
      shader: thresholdShader,
      pipelineName: "bloomThresholdPassPipeline",
      pipelineLayout: treshLayout,
      consts: {
        workgroupSize: this.groupSIze,
      },
    });
    const presentation = await Aurora.createComputePipeline({
      shader: upscaleShader,
      pipelineName: "bloomPresentPassPipeline",
      pipelineLayout: presentLayout,
      consts: {
        workgroupSize: this.groupSIze,
      },
    });
    this.pipelines = new Map([
      ["threshold", thresholdPipeline],
      ["upscale", upscalePipeline],
      ["y", pipelineY],
      ["x", pipelineX],
      ["bloomPresent", presentation],
    ]);
  }
  private static getLayout(name: string) {
    const layout = this.bindLayouts.get(name);
    assert(layout !== undefined, `bloom layout with name ${name} not found`);
    return layout;
  }
  private static getBind(name: string) {
    const bind = this.bindList.get(name);
    assert(bind !== undefined, `bloom bind with name ${name} not found`);
    return bind;
  }
  private static getPipeline(name: string) {
    const pipeline = this.pipelines.get(name);
    assert(
      pipeline !== undefined,
      `bloom pipeline with name ${name} not found`
    );
    return pipeline;
  }
  private static log(msg: string) {
    if (this.DEBUG) console.log(msg);
  }
}
