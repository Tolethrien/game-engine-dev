import { assert, loadImg } from "../../utils/utils";
import type {
  AuroraComputePipeline,
  AuroraRenderPipeline,
  BufferOptions,
  ColorAttachments,
  CreateBindGroup,
  CreateBindGroupA,
  GenerateGPUTextureProps,
  GPUAuroraTexture,
  MappedBufferOptions,
  QueryBuffer,
  TextureArrayProps,
  TextureEmptyProps,
  TextureProps,
} from "./aurora";
export const TYPED_MAP = {
  Float32Array,
  Float64Array,
  Uint16Array,
  Uint32Array,
  Uint8Array,
};
export const USAGE_MAP = {
  dynamic: {
    vertex: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    index: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    storage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    uniform: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  },
  mapped: {
    vertex: GPUBufferUsage.VERTEX,
    index: GPUBufferUsage.INDEX,
    storage: GPUBufferUsage.STORAGE,
    uniform: GPUBufferUsage.UNIFORM,
  },
  query: {
    read: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    write: GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
  },
};
export default class Aurora {
  public static adapter: GPUAdapter;
  public static device: GPUDevice;
  public static canvas: HTMLCanvasElement;
  public static context: GPUCanvasContext;
  public static async init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    console.log(canvas);
    const ctx = canvas.getContext("webgpu");
    assert(ctx !== null, "there is no WebGpu context in canvas");
    this.context = ctx;
    assert(
      navigator.gpu !== undefined,
      "WebGPU is not supported on this browser.",
    );

    const adapter = await navigator.gpu.requestAdapter();
    assert(adapter !== null, "Failed to get GPU adapter.");
    this.adapter = adapter;
    this.device = await adapter.requestDevice({
      requiredFeatures: ["timestamp-query"],
    });

    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({
      device: this.device,
      format: format,
      alphaMode: "opaque",
    });
  }
  public static stop() {
    this.device.destroy();
  }
  public static createBuffer(settings: BufferOptions) {
    const buffer = this.device.createBuffer({
      label: settings.label ?? "generic vertex buffer",
      size:
        TYPED_MAP[settings.dataType].BYTES_PER_ELEMENT * settings.dataLength,
      usage: USAGE_MAP.dynamic[settings.bufferType],
    });

    return buffer;
  }
  public static createQueryBuffer({ count, mode }: QueryBuffer) {
    const buffer = this.device.createBuffer({
      size: count * Float64Array.BYTES_PER_ELEMENT,
      usage: USAGE_MAP.query[mode],
    });
    return buffer;
  }
  public static createMappedBuffer(settings: MappedBufferOptions) {
    const buffer = this.device.createBuffer({
      label: settings.label ?? "generic vertex buffer",
      size:
        TYPED_MAP[settings.dataType].BYTES_PER_ELEMENT * settings.data.length,
      usage: USAGE_MAP.mapped[settings.bufferType],
      mappedAtCreation: true,
    });
    new TYPED_MAP[settings.dataType](buffer.getMappedRange()).set(
      settings.data,
    );
    buffer.unmap();
    return buffer;
  }
  public static createShader(shaderName: string, shaderCode: string) {
    return this.device.createShaderModule({
      label: shaderName,
      code: shaderCode,
    });
  }
  public static createSampler(desc?: GPUSamplerDescriptor) {
    return this.device.createSampler(desc);
  }
  public static createPipelineLayout(bindGLayout: GPUBindGroupLayout[]) {
    return this.device.createPipelineLayout({ bindGroupLayouts: bindGLayout });
  }
  public static createComputePipeline(props: AuroraComputePipeline) {
    return this.device.createComputePipelineAsync({
      layout: props.pipelineLayout,
      label: props.pipelineName,
      compute: {
        module: props.shader,
        entryPoint: "computeMain",
        constants: props.consts ?? undefined,
      },
    });
  }
  public static createRenderPipeline(props: AuroraRenderPipeline) {
    return this.device.createRenderPipelineAsync({
      label: props.pipelineName,
      layout: props.pipelineLayout,
      vertex: {
        module: props.shader,
        entryPoint: "vertexMain",
        buffers: props.buffers,
        constants: props.consts ?? undefined,
      },
      primitive: props.primitive,
      fragment: {
        module: props.shader,
        entryPoint: "fragmentMain",
        targets: props.colorTargets ?? [
          this.getColorTargetTemplate("standard"),
        ],
        constants: props.consts ?? undefined,
      },
      depthStencil: props.depthStencil,
    });
  }
  public static createVertexBufferLayout(layout: GPUVertexBufferLayout) {
    return layout;
  }
  public static createQuerySet(descriptor: GPUQuerySetDescriptor) {
    return Aurora.device.createQuerySet(descriptor);
  }

  public static createBindGroup({
    entries,
    label,
  }: CreateBindGroupA): [GPUBindGroup, GPUBindGroupLayout] {
    const layoutEntries = entries.map((entry) => {
      const { layout, binding, visibility } = entry;
      return { visibility, binding, ...layout };
    });
    const bindLayout = this.device.createBindGroupLayout({
      label: `${label}Layout`,
      entries: layoutEntries,
    });
    const dataEntries = entries.map((entry) => {
      const { visibility, layout, ...dataEntry } = entry;
      return { ...dataEntry };
    });
    const bindGroup = this.device.createBindGroup({
      entries: dataEntries,
      layout: bindLayout,
      label: `${label}Data`,
    });
    return [bindGroup, bindLayout];
  }
  public static createBindLayout(
    layout: CreateBindGroup["layout"],
  ): GPUBindGroupLayout {
    return this.device.createBindGroupLayout(layout);
  }
  public static getNewBindGroupFromLayout(
    data: CreateBindGroup["data"],
    layout: GPUBindGroupLayout,
  ) {
    const bindGroup = this.device.createBindGroup({
      entries: data.entries,
      layout: layout,
      label: data.label,
    });
    return bindGroup;
  }

  public static getColorTargetTemplate(
    type: ColorAttachments,
  ): GPUColorTargetState {
    switch (type) {
      case "standard":
        return {
          format: navigator.gpu.getPreferredCanvasFormat(),
          writeMask: GPUColorWrite.ALL,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        };
      case "HDR":
        return {
          format: "rgba16float",
          writeMask: GPUColorWrite.ALL,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        };
      case "zBufferDump":
        return {
          format: "r16float",
          writeMask: GPUColorWrite.RED,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "zero",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "zero",
              operation: "add",
            },
          },
        };
      case "additive":
        return {
          format: "bgra8unorm",
          writeMask: GPUColorWrite.ALL,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add",
            },
          },
        };
      case "additiveHDR":
        return {
          format: "rgba16float",
          writeMask: GPUColorWrite.ALL,
          blend: {
            color: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one",
              operation: "add",
            },
          },
        };
      default:
        return {
          format: navigator.gpu.getPreferredCanvasFormat(),
          writeMask: GPUColorWrite.ALL,
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
          },
        };
    }
  }
  public static createTextureEmpty({
    label,
    format,
    size,
    isStorage = false,
  }: TextureEmptyProps) {
    const gpuTexture = this.generateGPUTexture({
      label,
      size: { w: size.width, h: size.height },
      format,
      isStorage: isStorage,
    });

    const textureData: GPUAuroraTexture = {
      texture: gpuTexture,
      label,
      meta: {
        height: gpuTexture.height,
        width: gpuTexture.width,
        arrayTextureLength: 1,
        mipCount: 1,
        format: format ?? "bgra8unorm",
        src: new Map([
          [
            label,
            {
              height: gpuTexture.height,
              width: gpuTexture.width,
              src: "empty",
            },
          ],
        ]),
      },
    };
    return textureData;
  }
  public static async createTexture({
    format,
    label,
    url,
    flipY,
  }: TextureProps) {
    const img = await loadImg(url);
    const bitmap = await createImageBitmap(img);
    const gpuTexture = this.generateGPUTexture({
      label,
      size: { w: bitmap.width, h: bitmap.height },
      format,
    });

    Aurora.device.queue.copyExternalImageToTexture(
      { source: bitmap, flipY: flipY },
      { texture: gpuTexture },
      {
        width: bitmap.width,
        height: bitmap.height,
      },
    );
    const textureData: GPUAuroraTexture = {
      texture: gpuTexture,
      label,
      meta: {
        height: gpuTexture.height,
        width: gpuTexture.width,
        arrayTextureLength: 1,
        format: format ?? "bgra8unorm",
        mipCount: 1,
        src: new Map([
          [
            label,
            {
              height: bitmap.height,
              width: bitmap.width,
              src: url,
            },
          ],
        ]),
      },
    };
    return textureData;
  }
  public static async createTextureArray({
    format,
    label,
    textures,
    flipY,
  }: TextureArrayProps) {
    const bitmaps: ImageBitmap[] = [];
    for (const { url } of textures) {
      const img = await loadImg(url);
      const bitmap = await createImageBitmap(img);
      bitmaps.push(bitmap);
    }

    const { textureHeight, textureWidth } = this.calculateDimension(bitmaps);
    const gpuTexture = this.generateGPUTexture({
      label,
      size: { w: textureWidth, h: textureHeight, z: textures.length },
      format,
    });

    const textureData: GPUAuroraTexture = {
      texture: gpuTexture,
      label,
      meta: {
        height: gpuTexture.height,
        width: gpuTexture.width,
        format: format ?? "bgra8unorm",
        mipCount: 1,
        src: new Map(),
        arrayTextureLength: bitmaps.length,
      },
    };
    bitmaps.forEach((bitMap, index) => {
      textureData.meta.src.set(textures[index].name, {
        width: bitMap.width,
        height: bitMap.height,
        index,
        name: textures[index].name,
        src: textures[index].url,
      });
      Aurora.device.queue.copyExternalImageToTexture(
        { source: bitMap, flipY: flipY },
        { texture: gpuTexture, origin: { z: index } },
        {
          width: bitMap.width,
          height: bitMap.height,
        },
      );
    });

    return textureData;
  }

  public static createEmptyMipTexture({
    mipCount,
    size,
    format,
    label,
    isStorage,
  }: GenerateGPUTextureProps) {
    const gpuTexture = this.generateGPUTexture({
      label,
      size: { w: size.w, h: size.h },
      format,
      isStorage: isStorage,
      mipCount: mipCount,
    });

    const textureData: GPUAuroraTexture = {
      texture: gpuTexture,
      label,
      meta: {
        height: gpuTexture.height,
        width: gpuTexture.width,
        arrayTextureLength: 1,
        mipCount: mipCount ?? 1,
        format: format ?? "bgra8unorm",
        src: new Map([
          [
            label,
            {
              height: gpuTexture.height,
              width: gpuTexture.width,
              src: "empty",
            },
          ],
        ]),
      },
    };
    return textureData;
  }
  private static calculateDimension(textures: ImageBitmap[]) {
    let textureWidth = 0;
    let textureHeight = 0;

    textures.forEach((bitmap) => {
      textureWidth = Math.max(bitmap.width, textureWidth);
      textureHeight = Math.max(bitmap.height, textureHeight);
    });
    return { textureWidth, textureHeight };
  }
  private static generateGPUTexture({
    format,
    size,
    label,
    isStorage,
    mipCount = 1,
  }: GenerateGPUTextureProps) {
    let usage =
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.RENDER_ATTACHMENT;
    if (isStorage) usage |= GPUTextureUsage.STORAGE_BINDING;
    return Aurora.device.createTexture({
      format: format ?? "bgra8unorm",
      size: {
        width: size.w,
        height: size.h,
        depthOrArrayLayers: size.z ?? 1,
      },
      label,
      usage,
      mipLevelCount: mipCount,
    });
  }
}
