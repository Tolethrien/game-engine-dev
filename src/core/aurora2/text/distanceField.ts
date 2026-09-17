const FAR = 1e20;

/**
 * Signed distance field of a glyph mask, exact euclidean transform
 * (Felzenszwalb and Huttenlocher), linear in the number of pixels.
 */
export default class DistanceField {
  private static outside = new Float64Array(0);
  private static inside = new Float64Array(0);
  // 1D transform scratch, sized to the longer side
  private static f = new Float64Array(0);
  private static d = new Float64Array(0);
  private static v = new Int32Array(0);
  private static z = new Float64Array(0);

  /**
   * RGBA in, coverage in alpha. Writes the distance into red: 0.5 on the edge,
   * 1 at spread pixels inside, 0 at spread pixels outside. Green and blue go white.
   */
  public static encode(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    spread: number,
  ) {
    const count = width * height;
    this.reserve(count, Math.max(width, height));
    const outside = this.outside;
    const inside = this.inside;
    for (let i = 0; i < count; i++) {
      const covered = pixels[i * 4 + 3] >= 128;
      outside[i] = covered ? 0 : FAR;
      inside[i] = covered ? FAR : 0;
    }
    this.transform(outside, width, height);
    this.transform(inside, width, height);

    for (let i = 0; i < count; i++) {
      const coverage = pixels[i * 4 + 3] / 255;
      // pixel centers sit half a pixel from the edge between them
      let distance =
        coverage >= 0.5
          ? 0.5 - Math.sqrt(inside[i])
          : Math.sqrt(outside[i]) - 0.5;
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

  /** squared distances in place: columns first, then rows */
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

  /** lower envelope of parabolas over f, result in d */
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
