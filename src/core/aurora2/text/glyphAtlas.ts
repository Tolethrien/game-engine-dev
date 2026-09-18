import Aurora from "../core";
import DistanceField from "./distanceField";

export interface AtlasSlot {
  layer: number;
  x: number;
  y: number;
}
export interface StoredGlyph {
  page: number;
  uv: [number, number, number, number];
}
interface Shelf {
  page: number;
  y: number;
  height: number;
  x: number;
}

const GAP = 1;

export default class GlyphAtlas {
  private readonly texture: GPUTexture;
  private readonly firstLayer: number;
  private readonly pages: number;
  private readonly pageSize: number;
  public readonly spread: number;
  private shelves: Shelf[] = [];
  private pageBottom: number[];
  private warned = false;

  constructor(
    texture: GPUTexture,
    firstLayer: number,
    pages: number,
    pageSize: number,
    spread: number,
  ) {
    this.texture = texture;
    this.firstLayer = firstLayer;
    this.pages = pages;
    this.pageSize = pageSize;
    this.spread = spread;
    this.pageBottom = new Array(pages).fill(0);
  }

  public get padding() {
    return this.spread + 1;
  }

  public store(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
  ): StoredGlyph | null {
    const slot = this.allocate(width, height);
    if (!slot) return null;

    DistanceField.encode(pixels, width, height, this.spread);
    Aurora.device.queue.writeTexture(
      {
        texture: this.texture,
        origin: { x: slot.x, y: slot.y, z: slot.layer },
      },
      pixels,
      { bytesPerRow: width * 4 },
      { width, height },
    );

    const layerWidth = this.texture.width;
    const layerHeight = this.texture.height;
    return {
      page: slot.layer,
      uv: [
        slot.x / layerWidth,
        slot.y / layerHeight,
        width / layerWidth,
        height / layerHeight,
      ],
    };
  }

  public storeBitmap(bitmap: ImageBitmap): AtlasSlot | null {
    const slot = this.allocate(bitmap.width, bitmap.height);
    if (!slot) return null;
    Aurora.device.queue.copyExternalImageToTexture(
      { source: bitmap, origin: { x: 0, y: 0 } },
      {
        texture: this.texture,
        origin: { x: slot.x, y: slot.y, z: slot.layer },
      },
      { width: bitmap.width, height: bitmap.height },
    );
    return slot;
  }

  public get layerSize(): Size2D {
    return { width: this.texture.width, height: this.texture.height };
  }

  private allocate(width: number, height: number): AtlasSlot | null {
    const w = width + GAP;
    const h = height + GAP;
    let best: Shelf | null = null;
    for (const shelf of this.shelves) {
      if (shelf.height < h || shelf.x + w > this.pageSize) continue;
      if (!best || shelf.height < best.height) best = shelf;
    }
    if (best && best.height <= h * 1.5) return this.place(best, w);

    for (let page = 0; page < this.pages; page++) {
      const y = this.pageBottom[page];
      if (y + h > this.pageSize || w > this.pageSize) continue;
      const shelf = { page, y, height: h, x: 0 };
      this.pageBottom[page] = y + h;
      this.shelves.push(shelf);
      return this.place(shelf, w);
    }
    if (best) return this.place(best, w);

    if (!this.warned) {
      this.warned = true;
      console.warn(
        `Glyph atlas is full (${this.pages} pages of ${this.pageSize}px), new glyphs use the fallback, raise fontAtlas.pages in config`,
      );
    }
    return null;
  }

  private place(shelf: Shelf, width: number): AtlasSlot {
    const slot = {
      layer: this.firstLayer + shelf.page,
      x: shelf.x,
      y: shelf.y,
    };
    shelf.x += width;
    return slot;
  }
}
