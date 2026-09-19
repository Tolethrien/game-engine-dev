import Aurora from "../core";
import quad from "../shaders/draw/drawQuad.wgsl?raw";
import textShader from "../shaders/draw/drawText.wgsl?raw";
import guiTextShader from "../shaders/draw/drawGuiText.wgsl?raw";
import guiShader from "../shaders/draw/drawGui.wgsl?raw";
export function generateInternalBuffers() {
  //main indexBuffer
  const index = Aurora.createMappedBuffer({
    data: [0, 1, 2, 1, 2, 3],
    bufferType: "index",
    dataType: "Uint32Array",
    label: "indexBuffer",
  });

  //bloom params buffer
  const bloomParams = Aurora.createBuffer({
    bufferType: "uniform",
    dataLength: 4,
    dataType: "Float32Array",
    label: "bloomParamsBuffer",
  });
  const cameraMatrix = Aurora.createBuffer({
    bufferType: "uniform",
    dataType: "Float32Array",
    dataLength: 16,
    label: "CameraBuffer",
  });
  const worldBound = Aurora.createBuffer({
    bufferType: "uniform",
    dataType: "Float32Array",
    dataLength: 3,
    label: "worldBoundBuffer",
  });
  const viewport = Aurora.createBuffer({
    bufferType: "uniform",
    dataType: "Float32Array",
    dataLength: 2,
    label: "viewportBuffer",
  });
  return new Map([
    ["index", index],
    ["bloomParams", bloomParams],
    ["cameraMatrix", cameraMatrix],
    ["worldBound", worldBound],
    ["viewport", viewport],
  ]);
}
export function generateInternalTextures(res: Size2D, bloomMip: number) {
  const canvasWidth = res.width;
  const canvasHeight = res.height;
  //stage 1
  const offscreen = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "offscreenCanvas",
  });
  //stage2
  const finalDraw = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "finalDraw",
    isStorage: true,
  });
  //stage2
  const finalPostLDR = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "finalPostLDR",
  });
  const gui = Aurora.createTextureEmpty({
    size: {
      width: Aurora.canvas.width,
      height: Aurora.canvas.height,
    },
    format: "bgra8unorm",
    label: "GUI",
  });
  const depth = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "depth24plus",
    label: "z-buffer Texture",
  });

  const zdump = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "r16float",
    label: "zBufferDump",
  });

  const light = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "lightMap",
  });
  //pre fill with "byte white" if there is no lighting pipeline use, so that shader can just multiply everything by 1 (empty would be 0)
  // there is no float16Array so i used uint16 and fill with "white half float" and then multiply by 2 for full float
  const pixels = new Uint16Array(canvasWidth * canvasHeight * 4).fill(0x3c00);
  Aurora.device.queue.writeTexture(
    {
      texture: light.texture,
    },
    pixels,
    {
      bytesPerRow: canvasWidth * 4 * 2,
      rowsPerImage: canvasHeight,
    },
    {
      width: canvasWidth,
      height: canvasHeight,
    },
  );

  const bloomThreshold = Aurora.createEmptyMipTexture({
    size: {
      w: canvasWidth,
      h: canvasHeight,
    },
    format: "rgba16float",
    label: "bloomThreshold",
    isStorage: true,
    mipCount: 2,
  });
  const bloomEffect = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "bloomEffect",
    isStorage: true,
  });

  const bloomXPass = Aurora.createEmptyMipTexture({
    size: {
      w: canvasWidth / 2,
      h: canvasHeight / 2,
    },
    format: "rgba16float",
    label: "bloomXPass",
    isStorage: true,
    mipCount: bloomMip,
  });
  const bloomYPass = Aurora.createEmptyMipTexture({
    size: {
      w: canvasWidth / 2,
      h: canvasHeight / 2,
    },
    format: "rgba16float",
    label: "bloomYPass",
    isStorage: true,
    mipCount: bloomMip,
  });
  const pingFull = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "pingFull",
  });
  const pongFull = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "pongFull",
  });
  //empty texture to clear other
  const empty = Aurora.createTextureEmpty({
    size: {
      width: canvasWidth,
      height: canvasHeight,
    },
    format: "rgba16float",
    label: "EmptySwapTexture",
  });
  return new Map([
    //draw stages
    ["offscreenCanvas", offscreen],
    ["finalDraw", finalDraw],
    ["PostLDR", finalPostLDR],
    ["gui", gui],
    //other
    ["depthTexture", depth],
    ["zBufferDump", zdump],
    ["lightMap", light],
    ["bloomThreshold", bloomThreshold],
    ["bloomEffect", bloomEffect],
    ["bloomXPass", bloomXPass],
    ["bloomYPass", bloomYPass],
    ["pingX1", pingFull],
    ["pongX1", pongFull],
    ["empty", empty],
  ]);
}
export function generateInternalSamplers() {
  const universal = Aurora.createSampler();
  const fontGen = Aurora.createSampler({
    label: "msdf sampler",
    minFilter: "linear",
    magFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 16,
  });
  const sortedDrawZBuffer = Aurora.createSampler({ compare: "greater-equal" });
  const linear = Aurora.createSampler({
    label: "linear",
    minFilter: "linear",
    magFilter: "linear",
    mipmapFilter: "linear",
    maxAnisotropy: 1,
  });

  return new Map([
    ["universal", universal],
    ["fontGen", fontGen],
    ["sortedDrawZBuffer", sortedDrawZBuffer],
    ["linear", linear],
  ]);
}
export function compileShaders() {
  const quadShader = Aurora.createShader("quadShader", quad);
  const gui = Aurora.createShader("guiShader", guiShader);
  const text = Aurora.createShader("textShader", textShader);
  const guiText = Aurora.createShader("guiTextShader", guiTextShader);

  return new Map([
    ["quadShader", quadShader],
    ["textShader", text],
    ["guiShader", gui],
    ["guiTextShader", guiText],
  ]);
}
