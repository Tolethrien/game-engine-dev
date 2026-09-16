import AssetManager from "../assetManager";
import Aurora from "../core";
import { RenderPass, PassResources, PassTargets } from "../pass";
import shader from "../shaders/sprites.wgsl?raw";
import VertexLayout, { VertexFields } from "../utils/vertexLayout";
import GrowingBuffer from "../utils/growingBuffer";
import Blend from "../utils/blend";

const SPRITE_FIELDS = {
  position: "float32x2",
  size: "float32x2",
  tint: "unorm8x4",
  uvRect: "float32x4",
  layer: "uint32",
} satisfies VertexFields;
const SPRITE_VERTEX = new VertexLayout(SPRITE_FIELDS, { stepMode: "instance" });

export interface IsoChunkOptions {
  texture: string;
  tileWidth: number;
  tileHeight: number;
  variants: number;
  size: number;
}

export default class IsoChunkPass extends RenderPass {
  public readonly name = "isoChunk";
  declare private pipeline: GPURenderPipeline;
  declare private tiles: GrowingBuffer;
  private readonly options: IsoChunkOptions;

  constructor(options: IsoChunkOptions) {
    super();
    this.options = options;
  }

  async setup(targets: PassTargets) {
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "isoChunk",
      shader,
      buffers: [SPRITE_VERTEX.layout],
      blend: Blend.alpha,
      constants: { linearColors: Aurora.isLinear },
    });

    const { texture, tileWidth, tileHeight, variants, size } = this.options;
    const count = size * size;
    this.tiles = new GrowingBuffer({
      label: "isoChunkInstanceBuffer",
      stride: SPRITE_VERTEX.stride,
      usage: GPUBufferUsage.VERTEX,
      capacity: count,
    });
    const page = AssetManager.getTexture(texture);
    const vert = SPRITE_VERTEX.createWriter(this.tiles);
    const halfW = tileWidth / 2;
    const halfH = tileHeight / 2;

    this.tiles.begin(count);
    let index = 0;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const variant = this.hash(col, row) % variants;
        vert.at(index++);
        vert.position((col - row) * halfW - halfW, (col + row) * halfH);
        vert.size(tileWidth, tileHeight);
        vert.tint(255, 255, 255, 255);
        vert.uvRect(
          (variant * tileWidth) / page.layerWidth,
          0,
          tileWidth / page.layerWidth,
          tileHeight / page.layerHeight,
        );
        vert.layer(page.index);
      }
    }
    this.tiles.upload();
  }

  resources(res: PassResources) {
    res.readAsset("albedo");
    res.sampler("nearestClamp");
    res.write("scene");
  }

  execute(encoder: GPURenderPassEncoder) {
    encoder.setPipeline(this.pipeline);
    encoder.setVertexBuffer(0, this.tiles.getBuffer);
    encoder.draw(6, this.tiles.getCount);
  }

  destroy() {
    this.tiles.destroy();
  }

  private hash(x: number, y: number) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
}
