type Vec3Tuple = [number, number, number];

export default class Mat4 {
  private static readonly EPSILON = 0.000001;

  elements: Float32Array;

  private constructor(data: number[]) {
    this.elements = new Float32Array(data);
  }

  static create(data: number[]) {
    return new Mat4(data);
  }

  static get identity() {
    // prettier-ignore
    return Mat4.create([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  }

  static ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
  ) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    // prettier-ignore
    return Mat4.create([
      -2 * lr, 0, 0, 0,
      0, -2 * bt, 0, 0,
      0, 0, nf, 0,
      (left + right) * lr, (top + bottom) * bt, near * nf, 1,
    ]);
  }

  static lookAt(eye: Vec3Tuple, center: Vec3Tuple, up: Vec3Tuple) {
    if (
      Math.abs(eye[0] - center[0]) < Mat4.EPSILON &&
      Math.abs(eye[1] - center[1]) < Mat4.EPSILON &&
      Math.abs(eye[2] - center[2]) < Mat4.EPSILON
    )
      return Mat4.identity;

    let z0 = eye[0] - center[0];
    let z1 = eye[1] - center[1];
    let z2 = eye[2] - center[2];
    let len = 1 / Math.hypot(z0, z1, z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    let x0 = up[1] * z2 - up[2] * z1;
    let x1 = up[2] * z0 - up[0] * z2;
    let x2 = up[0] * z1 - up[1] * z0;
    len = Math.hypot(x0, x1, x2);
    if (!len) {
      x0 = 0;
      x1 = 0;
      x2 = 0;
    } else {
      len = 1 / len;
      x0 *= len;
      x1 *= len;
      x2 *= len;
    }

    let y0 = z1 * x2 - z2 * x1;
    let y1 = z2 * x0 - z0 * x2;
    let y2 = z0 * x1 - z1 * x0;
    len = Math.hypot(y0, y1, y2);
    if (!len) {
      y0 = 0;
      y1 = 0;
      y2 = 0;
    } else {
      len = 1 / len;
      y0 *= len;
      y1 *= len;
      y2 *= len;
    }
    // prettier-ignore
    return Mat4.create([
      x0, y0,z0,0,
      x1,y1,z1,0,
      x2,y2,z2,0,
      -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),-(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),-(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),1,
    ]);
  }
  static perspective(
    fovYRadians: number,
    aspect: number,
    near: number,
    far: number,
  ) {
    const f = 1 / Math.tan(fovYRadians / 2);
    const nf = 1 / (near - far);
    // prettier-ignore
    return Mat4.create([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
  }

  clone() {
    return Mat4.create(Array.from(this.elements));
  }

  translate(vec: Vec3Tuple) {
    const m = this.elements;
    const x = vec[0],
      y = vec[1],
      z = vec[2];
    m[12] = m[0] * x + m[4] * y + m[8] * z + m[12];
    m[13] = m[1] * x + m[5] * y + m[9] * z + m[13];
    m[14] = m[2] * x + m[6] * y + m[10] * z + m[14];
    m[15] = m[3] * x + m[7] * y + m[11] * z + m[15];
    return this;
  }

  scale(scalar: number) {
    const m = this.elements;
    for (let i = 0; i < 12; i++) m[i] *= scalar;
    return this;
  }

  multiply(other: Mat4) {
    const a = this.elements;
    const b = other.elements;
    const data: number[] = [];
    for (let col = 0; col < 4; col++) {
      const bCol = [b[col * 4], b[col * 4 + 1], b[col * 4 + 2], b[col * 4 + 3]];
      for (let row = 0; row < 4; row++) {
        data[col * 4 + row] =
          bCol[0] * a[row] +
          bCol[1] * a[row + 4] +
          bCol[2] * a[row + 8] +
          bCol[3] * a[row + 12];
      }
    }
    this.elements = new Float32Array(data);
    return this;
  }

  invert() {
    const m = this.elements;
    const a00 = m[0],
      a01 = m[1],
      a02 = m[2],
      a03 = m[3];
    const a10 = m[4],
      a11 = m[5],
      a12 = m[6],
      a13 = m[7];
    const a20 = m[8],
      a21 = m[9],
      a22 = m[10],
      a23 = m[11];
    const a30 = m[12],
      a31 = m[13],
      a32 = m[14],
      a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    const det =
      b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < Mat4.EPSILON)
      throw new Error("Mat4 invert Error: determinant equals 0");
    const invDet = 1 / det;

    const data: number[] = [
      (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
      (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
      (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
      (a22 * b04 - a21 * b05 - a23 * b03) * invDet,
      (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
      (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
      (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
      (a20 * b05 - a22 * b02 + a23 * b01) * invDet,
      (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
      (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
      (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
      (a21 * b02 - a20 * b04 - a23 * b00) * invDet,
      (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
      (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
      (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
      (a20 * b03 - a21 * b01 + a22 * b00) * invDet,
    ];

    this.elements = new Float32Array(data);
    return this;
  }

  transform(
    vec: [number, number, number, number],
  ): [number, number, number, number] {
    const m = this.elements;
    return [
      m[0] * vec[0] + m[4] * vec[1] + m[8] * vec[2] + m[12] * vec[3],
      m[1] * vec[0] + m[5] * vec[1] + m[9] * vec[2] + m[13] * vec[3],
      m[2] * vec[0] + m[6] * vec[1] + m[10] * vec[2] + m[14] * vec[3],
      m[3] * vec[0] + m[7] * vec[1] + m[11] * vec[2] + m[15] * vec[3],
    ];
  }

  rotateX(angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = this.elements;
    const m4 = m[4],
      m5 = m[5],
      m6 = m[6],
      m7 = m[7];
    const m8 = m[8],
      m9 = m[9],
      m10 = m[10],
      m11 = m[11];
    m[4] = m4 * c + m8 * s;
    m[5] = m5 * c + m9 * s;
    m[6] = m6 * c + m10 * s;
    m[7] = m7 * c + m11 * s;
    m[8] = m8 * c - m4 * s;
    m[9] = m9 * c - m5 * s;
    m[10] = m10 * c - m6 * s;
    m[11] = m11 * c - m7 * s;
    return this;
  }

  rotateY(angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = this.elements;
    const m0 = m[0],
      m1 = m[1],
      m2 = m[2],
      m3 = m[3];
    const m8 = m[8],
      m9 = m[9],
      m10 = m[10],
      m11 = m[11];
    m[0] = m0 * c - m8 * s;
    m[1] = m1 * c - m9 * s;
    m[2] = m2 * c - m10 * s;
    m[3] = m3 * c - m11 * s;
    m[8] = m0 * s + m8 * c;
    m[9] = m1 * s + m9 * c;
    m[10] = m2 * s + m10 * c;
    m[11] = m3 * s + m11 * c;
    return this;
  }

  rotateZ(angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = this.elements;
    const m0 = m[0],
      m1 = m[1],
      m2 = m[2],
      m3 = m[3];
    const m4 = m[4],
      m5 = m[5],
      m6 = m[6],
      m7 = m[7];
    m[0] = m0 * c + m4 * s;
    m[1] = m1 * c + m5 * s;
    m[2] = m2 * c + m6 * s;
    m[3] = m3 * c + m7 * s;
    m[4] = m4 * c - m0 * s;
    m[5] = m5 * c - m1 * s;
    m[6] = m6 * c - m2 * s;
    m[7] = m7 * c - m3 * s;
    return this;
  }
}
