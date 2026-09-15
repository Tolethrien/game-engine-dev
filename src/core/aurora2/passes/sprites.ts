import AssetManager from "../assetManager";
import Aurora from "../core";
import { Pass, PassResources, PassTargets } from "../pass";
import SharedBinds from "../sharedBinds";
import shader from "../shaders/sprites.wgsl?raw";
import VertexLayout, {
  VertexFields,
  VertexWriter,
} from "../utils/vertexLayout";
import GrowingBuffer from "../utils/growingBuffer";
import Blend from "../utils/blend";

const SPRITE_FIELDS = {
  position: "float32x2",
  size: "float32x2",
  tint: "float32x4",
  uvRect: "float32x4",
  layer: "uint32",
} satisfies VertexFields;
const SPRITE_VERTEX = new VertexLayout(SPRITE_FIELDS, {
  stepMode: "instance",
});
const SPRITES = [
  {
    texture: "icon",
    crop: { x: 0, y: 0, width: 512, height: 512 },
    x: 540,
    y: 40,
    w: 200,
    h: 200,
    tint: [1, 1, 1, 1],
  },
  {
    texture: "font",
    crop: { x: 0, y: 0, width: 64, height: 64 },
    x: 780,
    y: 40,
    w: 200,
    h: 200,
    tint: [1, 1, 1, 1],
  },
  {
    texture: "missing",
    crop: { x: 0, y: 0, width: 1, height: 1 },
    x: 1220,
    y: 40,
    w: 100,
    h: 100,
    tint: [1, 0.5, 0, 1],
  },
];

export default class SpritesPass extends Pass<"render"> {
  public readonly name = "sprites";
  public readonly type = "render";
  declare private pipeline: GPURenderPipeline;
  declare private sprites: GrowingBuffer;
  declare private writer: VertexWriter<typeof SPRITE_FIELDS>;

  async setup(targets: PassTargets) {
    this.pipeline = await Aurora.createRenderPipeline(targets, {
      label: "sprites",
      shader,
      buffers: [SPRITE_VERTEX.layout],
      blend: Blend.alpha,
    });
    this.sprites = new GrowingBuffer({
      label: "spritesInstanceBuffer",
      stride: SPRITE_VERTEX.stride,
      usage: GPUBufferUsage.VERTEX,
    });
    this.writer = SPRITE_VERTEX.createWriter(this.sprites);
  }

  resources(res: PassResources) {
    res.readAsset("albedo");
    res.sampler("nearestClamp");
    res.write(
      "scene",
      { size: { scale: 1 }, format: "rgba16float" },
      { loadOp: "load" },
    );
  }

  execute(encoder: GPURenderPassEncoder) {
    const vert = this.writer;
    this.sprites.begin(SPRITES.length);
    SPRITES.forEach((sprite, i) => {
      const page = AssetManager.getTexture(sprite.texture);
      const [r, g, b, a] = sprite.tint;
      vert.at(i);
      vert.position(sprite.x, sprite.y);
      vert.size(sprite.w, sprite.h);
      vert.tint(r, g, b, a);
      vert.uvRect(
        sprite.crop.x / page.layerWidth,
        sprite.crop.y / page.layerHeight,
        sprite.crop.width / page.layerWidth,
        sprite.crop.height / page.layerHeight,
      );
      vert.layer(page.index);
    });
    this.sprites.upload();

    encoder.setPipeline(this.pipeline);
    encoder.setVertexBuffer(0, this.sprites.getBuffer);
    encoder.draw(6, this.sprites.getCount);
  }

  destroy() {
    this.sprites.destroy();
    console.log("destroy", this.name);
  }
}
