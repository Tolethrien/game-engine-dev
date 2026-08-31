import Aurora from "../core";
import Renderer from "../renderer/renderer";
import AuroraDebugInfo from "../debugger/debugInfo";
import lightsShader from "../shaders/lights/light.wgsl?raw";

interface BatchNode {
  currentBatchSize: number;
  vertices: Float32Array<ArrayBuffer>;
  counter: number;
}
/**
 * Used to draw final offscreen onto canvas, possible post-processing like grayscale goes here too!
 */

export default class LightsPipeline {
  private static INIT_BATCH_SIZE = 20;
  private static VERTEX_STRIDE = 8;
  private static pipeline: GPURenderPipeline;
  private static vertexBuffer: GPUBuffer;
  private static addBuffer: GPUBuffer;
  private static bufferNeedResize = false;
  private static globalIllumination: RGB = [255, 255, 255];
  private static isEnable = true;
  private static needCleanup = false;
  private static batch: BatchNode = {
    vertices: new Float32Array(this.INIT_BATCH_SIZE * this.VERTEX_STRIDE),
    counter: 0,
    currentBatchSize: this.INIT_BATCH_SIZE,
  };

  public static get getStride() {
    return this.VERTEX_STRIDE;
  }
  public static getBatch() {
    if (this.batch.counter === this.batch.currentBatchSize) {
      const newSize = Math.ceil(this.batch.currentBatchSize * 1.5);
      this.batch.currentBatchSize = newSize;
      const batchVerticesCopy = this.batch.vertices;
      this.batch.vertices = new Float32Array(newSize * this.VERTEX_STRIDE);
      this.batch.vertices.set(batchVerticesCopy, 0);
      this.bufferNeedResize = true;
    }
    return this.batch;
  }
  public static async createPipeline() {
    this.isEnable = Renderer.getConfigGroup("feature").lighting;
    const shader = Aurora.createShader("lightsShader", lightsShader);

    const [_, cameraBindLayout] = Renderer.getBind("camera");
    this.vertexBuffer = Aurora.createBuffer({
      bufferType: "vertex",
      label: "lightVertexBuffer",
      dataLength: this.INIT_BATCH_SIZE * this.VERTEX_STRIDE,
      dataType: "Float32Array",
    });

    const vertBuffLay = Aurora.createVertexBufferLayout({
      arrayStride: this.VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT,
      stepMode: "instance",
      attributes: [
        {
          format: "float32x2",
          offset: 0,
          shaderLocation: 0, // Position
        },
        {
          format: "float32x2",
          offset: 2 * Float32Array.BYTES_PER_ELEMENT,
          shaderLocation: 1, // Size
        },
        {
          format: "float32x4",
          offset: 4 * Float32Array.BYTES_PER_ELEMENT,
          shaderLocation: 3, //tint
        },
      ],
    });
    const pipelineLayout = Aurora.createPipelineLayout([cameraBindLayout]);
    this.pipeline = await Aurora.createRenderPipeline({
      shader: shader,
      pipelineName: "lightsPipeline",
      buffers: [vertBuffLay],
      pipelineLayout: pipelineLayout,

      colorTargets: [Aurora.getColorTargetTemplate("additiveHDR")],
    });
  }
  public static clearPipeline() {
    this.batch.counter = 0;
    this.bufferNeedResize = false;
    if (this.needCleanup) this.cleanTexture();
  }
  private static resizeBuffer() {
    this.batch.currentBatchSize;

    this.vertexBuffer = Aurora.createBuffer({
      bufferType: "vertex",
      label: "lightVertexBuffer",
      dataLength: this.batch.currentBatchSize * this.VERTEX_STRIDE,
      dataType: "Float32Array",
    });
  }
  public static usePipeline(): void {
    if (!this.isEnable) return;
    if (this.bufferNeedResize) this.resizeBuffer();
    const [cameraBind] = Renderer.getBind("camera");
    const indexBuffer = Renderer.getBuffer("index");
    const commandEncoder = Renderer.getEncoder;

    const correction = this.getNormalizedIllumination;
    Aurora.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      this.batch.vertices,
      0
    );

    const passEncoder = commandEncoder.beginRenderPass({
      label: "lightsRenderPass",
      colorAttachments: [
        {
          view: Renderer.getTextureView("lightMap"),
          clearValue: [...correction, 0],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      timestampWrites: AuroraDebugInfo.setTimestamp("lightsStart", "lightsEnd"),
    });
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, cameraBind);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.setVertexBuffer(1, this.addBuffer);
    passEncoder.setIndexBuffer(indexBuffer, "uint32");
    passEncoder.drawIndexed(6, this.batch.counter);
    passEncoder.end();
    AuroraDebugInfo.accumulate("drawCalls", 1);
    AuroraDebugInfo.accumulate("renderPasses", 1);
    AuroraDebugInfo.setParam("drawnLights", this.batch.counter);
    AuroraDebugInfo.accumulate("pipelineInUse", ["Lights"]);
  }
  private static cleanTexture() {
    const commandEncoder = Renderer.getEncoder;
    const passEncoder = commandEncoder.beginRenderPass({
      label: "lightsRenderPass",
      colorAttachments: [
        {
          view: Renderer.getTextureView("lightMap"),
          clearValue: [1, 1, 1, 0],
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    passEncoder.end();
    this.needCleanup = false;
  }
  public static markToChange(enable: boolean) {
    if (enable) this.isEnable = true;
    else {
      this.needCleanup = true;
      this.isEnable = false;
    }
  }
  public static getGlobalIllumination(): RGB {
    return this.globalIllumination;
  }
  public static setGlobalIllumination(color: RGB) {
    this.globalIllumination = color;
  }
  private static get getNormalizedIllumination(): RGB {
    return [
      this.globalIllumination[0] / 255,
      this.globalIllumination[1] / 255,
      this.globalIllumination[2] / 255,
    ];
  }
}
