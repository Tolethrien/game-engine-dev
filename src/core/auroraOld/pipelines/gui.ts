import Aurora from "../core";
import Renderer from "../renderer/renderer";
import AuroraDebugInfo from "../debugger/debugInfo";
import { GPUAuroraTexture, PipelineBind } from "../aurora";

const USED_SHADERS = ["guiShader", "guiTextShader"] as const;
const SHAPE_BINDS = ["userTextures"];
const TEXT_BINDS = ["fonts"];
const BIND_DESC = {
  guiShader: SHAPE_BINDS,
  guiTextShader: TEXT_BINDS,
};
type ShaderType = (typeof USED_SHADERS)[number];
export type Clip = { x: number; y: number; w: number; h: number } | undefined;
interface PipelineDescriptor {
  name: ShaderType;
  shader: string;
  binds: string[];
}
interface RenderPipelineData {
  pipeline: GPURenderPipeline;
  bindList: GPUBindGroup[];
}
interface BatchNode {
  vertices: number[];
  counter: number;
  shader: ShaderType;
  clip: Clip;
}
export default class SequentialDrawPipeline {
  private static INIT_SIZE = 50;
  private static currentBufferSize = this.INIT_SIZE;
  private static VERTEX_STRIDE = 14;
  private static pipelines: Map<string, RenderPipelineData> = new Map();
  private static vertexBuffer: GPUBuffer;
  private static currentClip: Clip = undefined;
  private static viewportBind: PipelineBind;
  private static verticesList = new Float32Array(
    this.INIT_SIZE * this.VERTEX_STRIDE,
  );
  public static get getStride() {
    return this.VERTEX_STRIDE;
  }
  private static batchList: BatchNode[] = [];

  public static async createPipeline() {
    this.generateVertexLayout();
    this.vertexBuffer = Aurora.createBuffer({
      bufferType: "vertex",
      label: "GUIVertexBuffer",
      dataLength: this.INIT_SIZE * this.VERTEX_STRIDE,
      dataType: "Float32Array",
    });
    const viewportUniform = Aurora.createBindGroup({
      label: "viewportUniformBind",
      entries: [
        {
          binding: 0,
          layout: { buffer: { type: "uniform" } },
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          resource: { buffer: Renderer.getBuffer("viewport") },
        },
      ],
    });

    this.viewportBind = viewportUniform;
    for (const shaderType of USED_SHADERS) {
      const name = shaderType;
      const [pipeline, binds] = await this.generatePipeline({
        name,
        shader: name,
        binds: BIND_DESC[shaderType],
      });

      this.pipelines.set(name, { pipeline, bindList: binds });
    }
  }
  public static usePipeline() {
    this.validateBufferSize();
    Aurora.device.queue.writeBuffer(
      Renderer.getBuffer("viewport"),
      0,
      new Float32Array([Aurora.canvas.width, Aurora.canvas.height]),
      0,
    );
    const guiMeta = Renderer.getTexture("gui");
    const guiTexture = guiMeta.texture.createView();
    const indexBuffer = Renderer.getBuffer("index");
    const commandEncoder = Renderer.getEncoder;
    const offsets: number[] = [];
    let bufferByteOffset = 0;
    let vertexListOffset = 0;
    this.batchList.forEach((batch) => {
      offsets.push(bufferByteOffset);
      this.verticesList.set(batch.vertices, vertexListOffset);
      Aurora.device.queue.writeBuffer(
        this.vertexBuffer,
        bufferByteOffset,
        this.verticesList,
        vertexListOffset,
      );
      bufferByteOffset +=
        batch.counter * this.VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT;
      vertexListOffset += batch.vertices.length;
    });

    const passEncoder = commandEncoder.beginRenderPass({
      label: "GUIRenderPass",
      colorAttachments: [
        {
          view: guiTexture,
          loadOp: "clear",
          clearValue: [0, 0, 0, 0],
          storeOp: "store",
        },
      ],
      timestampWrites: AuroraDebugInfo.setTimestamp("guiStart", "guiEnd"),
    });

    let drawOffset = 0;
    this.batchList.forEach((batch) => {
      const offset = offsets[drawOffset];

      const { bindList, pipeline } = this.getPipeline(batch.shader);
      this.setScissor(batch.clip, passEncoder, guiMeta.meta);
      passEncoder.setPipeline(pipeline);
      passEncoder.setVertexBuffer(0, this.vertexBuffer, offset);
      bindList.forEach((bind, index) => passEncoder.setBindGroup(index, bind));
      passEncoder.setIndexBuffer(indexBuffer, "uint32");
      passEncoder.drawIndexed(6, batch.counter);
      AuroraDebugInfo.accumulate("drawCalls", 1);
      AuroraDebugInfo.accumulate("drawnGui", batch.counter);
      drawOffset++;
    });
    passEncoder.end();
    Renderer.pipelinesUsedInFrame.add("GUIDrawPipeline");
    AuroraDebugInfo.accumulate("renderPasses", 1);
    AuroraDebugInfo.accumulate("pipelineInUse", ["GUI"]);
  }
  private static setScissor(
    clip: Clip,
    encoder: GPURenderPassEncoder,
    meta: GPUAuroraTexture["meta"],
  ) {
    if (clip === undefined) {
      encoder.setScissorRect(0, 0, meta.width, meta.height);
      return;
    }
    // the caller may be a frame behind a resize — never let it escape the target
    const x = Math.max(0, Math.min(clip.x, meta.width));
    const y = Math.max(0, Math.min(clip.y, meta.height));
    const w = Math.max(0, Math.min(clip.w, meta.width - x));
    const h = Math.max(0, Math.min(clip.h, meta.height - y));
    encoder.setScissorRect(x, y, w, h);
  }
  public static clearPipeline() {
    this.batchList = [];
    this.currentClip = undefined;
  }
  public static setClip(clip: Clip) {
    if (clip !== undefined && this.currentClip !== undefined)
      console.warn(
        "trying to set new clip without popping last one, this will work but may be not intentional",
      );
    this.currentClip = clip;
  }
  public static getBatch(shader: ShaderType) {
    const batchNode = this.batchList.at(-1);

    if (
      batchNode === undefined ||
      batchNode.shader !== shader ||
      this.isClipDifferent(batchNode.clip)
    ) {
      const newBatch = this.newBatchNode(shader as ShaderType);
      newBatch.clip = this.currentClip;
      this.batchList.push(newBatch);
      return newBatch;
    }
    return batchNode;
  }
  private static isClipDifferent(clip: Clip) {
    if (clip === undefined && this.currentClip === undefined) {
      return false;
    }
    if (clip === undefined || this.currentClip === undefined) {
      return true;
    }
    return (
      clip.x !== this.currentClip.x ||
      clip.y !== this.currentClip.y ||
      clip.w !== this.currentClip.w ||
      clip.h !== this.currentClip.h
    );
  }
  private static getPipeline(name: ShaderType) {
    return this.pipelines.get(name)!;
  }
  private static validateBufferSize() {
    const drawSize = this.batchList.reduce(
      (prev, batch) => (prev += batch.counter),
      0,
    );
    if (this.currentBufferSize >= drawSize) return;
    const newSize = Math.ceil(drawSize * 1.5);
    this.verticesList = new Float32Array(newSize * this.VERTEX_STRIDE);
    this.vertexBuffer = Aurora.createBuffer({
      bufferType: "vertex",
      label: "GUIDrawVertexBuffer",
      dataLength: newSize * this.VERTEX_STRIDE,
      dataType: "Float32Array",
    });
    this.currentBufferSize = newSize;
  }

  private static newBatchNode(shader: ShaderType) {
    return {
      counter: 0,
      shader: shader,
      vertices: [],
      clip: undefined,
    } as BatchNode;
  }
  private static generateVertexLayout() {
    return Aurora.createVertexBufferLayout({
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
          shaderLocation: 2, // textureCrop
        },
        {
          format: "float32",
          offset: 8 * Float32Array.BYTES_PER_ELEMENT,
          shaderLocation: 3, // textureIndex
        },
        {
          format: "float32",
          offset: 9 * Float32Array.BYTES_PER_ELEMENT,
          shaderLocation: 4, // round
        },
        {
          format: "float32x4",
          offset: 10 * Float32Array.BYTES_PER_ELEMENT,
          shaderLocation: 5, // tint
        },
      ],
    });
  }
  private static async generatePipeline({
    name,
    shader,
    binds,
  }: PipelineDescriptor): Promise<[GPURenderPipeline, GPUBindGroup[]]> {
    const vertexLayout = this.generateVertexLayout();
    const bindLayoutList = binds.map(
      (bindName) => Renderer.getBind(bindName)[1],
    );
    const bindsDataList = binds.map(
      (bindName) => Renderer.getBind(bindName)[0],
    );

    bindsDataList.push(this.viewportBind[0]);
    bindLayoutList.push(this.viewportBind[1]);
    const shapePipelineLayout = Aurora.createPipelineLayout(bindLayoutList);
    const gpuShader = Renderer.getShader(shader);
    const pipe = await Aurora.createRenderPipeline({
      shader: gpuShader,
      pipelineName: `${name}Pipeline`,
      buffers: [vertexLayout],
      pipelineLayout: shapePipelineLayout,
      primitive: { topology: "triangle-list" },
      colorTargets: [Aurora.getColorTargetTemplate("standard")],
    });
    return [pipe, bindsDataList];
  }
}
