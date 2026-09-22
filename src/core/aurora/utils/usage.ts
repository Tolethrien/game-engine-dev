export const AuroraUsage = {
  buffer: GPUBufferUsage,
  texture: GPUTextureUsage,
  stage: GPUShaderStage,
  uniform: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  storage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  readback: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  allStages:
    GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
} as const;
