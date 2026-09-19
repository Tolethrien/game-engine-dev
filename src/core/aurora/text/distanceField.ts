const FAR = 1e20;

// the glyph rasterized scale times larger, the field is measured on it
export interface GlyphField {
  data: Uint8ClampedArray;
  scale: number;
}

export default class DistanceField {
  private static outside = new Float64Array(0);
  private static inside = new Float64Array(0);
  private static f = new Float64Array(0);
  private static d = new Float64Array(0);
  private static v = new Int32Array(0);
  private static z = new Float64Array(0);

  public static encode(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    spread: number,
    field: GlyphField,
  ) {
    const { data: fine, scale } = field;
    const fineWidth = width * scale;
    const fineHeight = height * scale;
    const fineCount = fineWidth * fineHeight;
    this.reserve(fineCount, Math.max(fineWidth, fineHeight));
    const outside = this.outside;
    const inside = this.inside;
    for (let i = 0; i < fineCount; i++) {
      const covered = fine[i * 4 + 3] >= 128;
      outside[i] = covered ? 0 : FAR;
      inside[i] = covered ? FAR : 0;
    }
    this.transform(outside, fineWidth, fineHeight);
    this.transform(inside, fineWidth, fineHeight);

    // the field is nearly linear inside a block, its average is the value at the center
    const blockArea = scale * scale;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let fineY = y * scale; fineY < (y + 1) * scale; fineY++) {
          const row = fineY * fineWidth;
          for (let fineX = x * scale; fineX < (x + 1) * scale; fineX++) {
            const fineIndex = row + fineX;
            // pixel centers sit half a pixel from the edge between them
            sum +=
              fine[fineIndex * 4 + 3] >= 128
                ? 0.5 - Math.sqrt(inside[fineIndex])
                : Math.sqrt(outside[fineIndex]) - 0.5;
          }
        }
        const i = y * width + x;
        let distance = sum / blockArea / scale;
        const coverage = pixels[i * 4 + 3] / 255;
        // antialiased pixels know better where the edge crosses them
        if (coverage > 0 && coverage < 1 && Math.abs(distance) <= 1) {
          distance = 0.5 - coverage;
        }
        const value = 0.5 - distance / (spread * 2);
        pixels[i * 4] = Math.round(Math.min(1, Math.max(0, value)) * 255);
        pixels[i * 4 + 1] = 255;
        pixels[i * 4 + 2] = 255;
      }
    }
  }

  private static reserve(count: number, side: number) {
    if (this.outside.length < count) {
      this.outside = new Float64Array(count);
      this.inside = new Float64Array(count);
    }
    if (this.f.length < side) {
      this.f = new Float64Array(side);
      this.d = new Float64Array(side);
      this.v = new Int32Array(side);
      this.z = new Float64Array(side + 1);
    }
  }

  private static transform(grid: Float64Array, width: number, height: number) {
    const f = this.f;
    const d = this.d;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
      this.transform1D(height);
      for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
    }
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) f[x] = grid[row + x];
      this.transform1D(width);
      for (let x = 0; x < width; x++) grid[row + x] = d[x];
    }
  }

  private static transform1D(length: number) {
    const { f, d, v, z } = this;
    let k = 0;
    v[0] = 0;
    z[0] = -FAR;
    z[1] = FAR;
    for (let q = 1; q < length; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = FAR;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k++;
      const offset = q - v[k];
      d[q] = offset * offset + f[v[k]];
    }
  }
}
