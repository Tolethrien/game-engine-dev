import { TYPED_MAP } from "./core";
type bufferType = "vertex" | "index" | "storage" | "uniform";
interface SharedBufferOptions {
  label: string;
  bufferType: bufferType;
  dataType: keyof typeof TYPED_MAP;
}
interface BufferOptions extends SharedBufferOptions {
  dataLength: number;
}
interface MappedBufferOptions extends SharedBufferOptions {
  data: number[];
}
interface QueryBuffer {
  count: number;
  mode: "read" | "write";
}
interface AuroraRenderPipeline {
  pipelineName: string;
  pipelineLayout: GPUPipelineLayout;
  shader: GPUShaderModule;
  buffers: GPUVertexBufferLayout[];
  colorTargets?: GPUColorTargetState[];
  depthStencil?: GPUDepthStencilState;
  primitive?: GPUPrimitiveState;
  consts?: Record<string, number>;
}
interface AuroraComputePipeline {
  pipelineName: string;
  pipelineLayout: GPUPipelineLayout;
  shader: GPUShaderModule;
  consts?: Record<string, number>;
}
type ColorAttachments =
  | "HDR"
  | "standard"
  | "storage-read-write"
  | "zBufferDump"
  | "additive"
  | "additiveHDR";
interface CreateBindGroup {
  layout: GPUBindGroupLayoutDescriptor;
  data: { entries: Iterable<GPUBindGroupEntry>; label?: string };
}
interface CreateBindGroupA {
  label: string;
  entries: {
    binding: number;
    visibility: GPUBindGroupLayoutEntry.visibility;
    layout: {
      texture?: GPUTextureBindingLayout | undefined;
      buffer?: GPUBufferBindingLayout | undefined;
      sampler?: GPUSamplerBindingLayout | undefined;
      storageTexture?: GPUStorageTextureBindingLayout | undefined;
      externalTexture?: GPUExternalTextureBindingLayout | undefined;
    };
    resource: GPUBindingResource;
  }[];
  // data: { entries: Iterable<GPUBindGroupEntry>; label?: string };
}
interface BaseTextureProps {
  format?: GPUTextureFormat;
  label: string;
}
interface TextureEmptyProps extends BaseTextureProps {
  size: Size2D;
  isStorage?: boolean;
}
interface TextureProps extends BaseTextureProps {
  url: string;
  flipY?: boolean;
}
interface TextureArrayProps extends BaseTextureProps {
  textures: { name: string; url: string }[];
  flipY?: boolean;
}
interface GenerateGPUTextureProps {
  format?: GPUTextureFormat;
  size: { w: number; h: number; z?: number };
  label: string;
  isStorage?: boolean;
  mipCount?: number;
}

interface GPUAuroraTexture {
  texture: GPUTexture;
  label: string;
  meta: {
    src: Map<string, ImgMeta>;
    width: number;
    height: number;
    arrayTextureLength: number;
    format: string;
    mipCount: number;
  };
}
type PipelineBind = [GPUBindGroup, GPUBindGroupLayout];
