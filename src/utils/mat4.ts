type lookType = [number, number, number];

export default class Mat4 {
  private matrix: Float32Array<ArrayBuffer>;
  private static EPSILON = 0.000001;
  private constructor(data: number[]) {
    this.matrix = new Float32Array(data);
  }

  public static create() {
    const data = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    return new Mat4(data);
  }
  get getMatrix() {
    return this.matrix;
  }
  set setMatrix(data: number[]) {
    this.matrix = new Float32Array(data);
  }
  ortho(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
  ) {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    const out = [
      -2 * lr,
      0,
      0,
      0,
      0,
      -2 * bt,
      0,
      0,
      0,
      0,
      nf,
      0,
      (left + right) * lr,
      (top + bottom) * bt,
      near * nf,
      1,
    ];
    return new Mat4(out);
  }
  public translate(vec: [number, number, number]) {
    const m = Array.from(this.matrix);
    const x = vec[0],
      y = vec[1],
      z = vec[2];
    m[12] = m[0] * x + m[4] * y + m[8] * z + m[12];
    m[13] = m[1] * x + m[5] * y + m[9] * z + m[13];
    m[14] = m[2] * x + m[6] * y + m[10] * z + m[14];
    m[15] = m[3] * x + m[7] * y + m[11] * z + m[15];
    return new Mat4(m);
  }
  lookAt(eye: lookType, center: lookType, up: lookType) {
    if (
      Math.abs(eye[0] - center[0]) < Mat4.EPSILON &&
      Math.abs(eye[1] - center[1]) < Mat4.EPSILON &&
      Math.abs(eye[2] - center[2]) < Mat4.EPSILON
    )
      return new Mat4([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

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
    const data = [
      x0,
      y0,
      z0,
      0,
      x1,
      y1,
      z1,
      0,
      x2,
      y2,
      z2,
      0,
      -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
      -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
      -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
      1,
    ];

    return new Mat4(data);
  }

  multiply(mat4: Mat4) {
    const bx = mat4.getMatrix;
    const data: number[] = [];
    let values = [bx[0], bx[1], bx[2], bx[3]];
    data[0] =
      values[0] * this.matrix[0] +
      values[1] * this.matrix[4] +
      values[2] * this.matrix[8] +
      values[3] * this.matrix[12];
    data[1] =
      values[0] * this.matrix[1] +
      values[1] * this.matrix[5] +
      values[2] * this.matrix[9] +
      values[3] * this.matrix[13];
    data[2] =
      values[0] * this.matrix[2] +
      values[1] * this.matrix[6] +
      values[2] * this.matrix[10] +
      values[3] * this.matrix[14];
    data[3] =
      values[0] * this.matrix[3] +
      values[1] * this.matrix[7] +
      values[2] * this.matrix[11] +
      values[3] * this.matrix[15];
    values = [bx[4], bx[5], bx[6], bx[7]];

    data[4] =
      values[0] * this.matrix[0] +
      values[1] * this.matrix[4] +
      values[2] * this.matrix[8] +
      values[3] * this.matrix[12];
    data[5] =
      values[0] * this.matrix[1] +
      values[1] * this.matrix[5] +
      values[2] * this.matrix[9] +
      values[3] * this.matrix[13];
    data[6] =
      values[0] * this.matrix[2] +
      values[1] * this.matrix[6] +
      values[2] * this.matrix[10] +
      values[3] * this.matrix[14];
    data[7] =
      values[0] * this.matrix[3] +
      values[1] * this.matrix[7] +
      values[2] * this.matrix[11] +
      values[3] * this.matrix[15];
    values = [bx[8], bx[9], bx[10], bx[11]];

    data[8] =
      values[0] * this.matrix[0] +
      values[1] * this.matrix[4] +
      values[2] * this.matrix[8] +
      values[3] * this.matrix[12];
    data[9] =
      values[0] * this.matrix[1] +
      values[1] * this.matrix[5] +
      values[2] * this.matrix[9] +
      values[3] * this.matrix[13];
    data[10] =
      values[0] * this.matrix[2] +
      values[1] * this.matrix[6] +
      values[2] * this.matrix[10] +
      values[3] * this.matrix[14];
    data[11] =
      values[0] * this.matrix[3] +
      values[1] * this.matrix[7] +
      values[2] * this.matrix[11] +
      values[3] * this.matrix[15];
    values = [bx[12], bx[13], bx[14], bx[15]];

    data[12] =
      values[0] * this.matrix[0] +
      values[1] * this.matrix[4] +
      values[2] * this.matrix[8] +
      values[3] * this.matrix[12];
    data[13] =
      values[0] * this.matrix[1] +
      values[1] * this.matrix[5] +
      values[2] * this.matrix[9] +
      values[3] * this.matrix[13];
    data[14] =
      values[0] * this.matrix[2] +
      values[1] * this.matrix[6] +
      values[2] * this.matrix[10] +
      values[3] * this.matrix[14];
    data[15] =
      values[0] * this.matrix[3] +
      values[1] * this.matrix[7] +
      values[2] * this.matrix[11] +
      values[3] * this.matrix[15];

    return new Mat4(data);
  }

  scale(scalar: number) {
    //TODO: dorobic scalar jako vector
    const scalarX = scalar;
    const scalarY = scalar;
    const scalarZ = scalar;
    const data = [
      this.matrix[0] * scalarX,
      this.matrix[1] * scalarX,
      this.matrix[2] * scalarX,
      this.matrix[3] * scalarX,
      this.matrix[4] * scalarY,
      this.matrix[5] * scalarY,
      this.matrix[6] * scalarY,
      this.matrix[7] * scalarY,
      this.matrix[8] * scalarZ,
      this.matrix[9] * scalarZ,
      this.matrix[10] * scalarZ,
      this.matrix[11] * scalarZ,
      this.matrix[12],
      this.matrix[13],
      this.matrix[14],
      this.matrix[15],
    ];
    return new Mat4(data);
  }
  invert() {
    let det: number;
    const data: number[] = [];

    data[0] =
      this.matrix[5] * this.matrix[10] * this.matrix[15] -
      this.matrix[5] * this.matrix[11] * this.matrix[14] -
      this.matrix[9] * this.matrix[6] * this.matrix[15] +
      this.matrix[9] * this.matrix[7] * this.matrix[14] +
      this.matrix[13] * this.matrix[6] * this.matrix[11] -
      this.matrix[13] * this.matrix[7] * this.matrix[10];

    data[4] =
      -this.matrix[4] * this.matrix[10] * this.matrix[15] +
      this.matrix[4] * this.matrix[11] * this.matrix[14] +
      this.matrix[8] * this.matrix[6] * this.matrix[15] -
      this.matrix[8] * this.matrix[7] * this.matrix[14] -
      this.matrix[12] * this.matrix[6] * this.matrix[11] +
      this.matrix[12] * this.matrix[7] * this.matrix[10];

    data[8] =
      this.matrix[4] * this.matrix[9] * this.matrix[15] -
      this.matrix[4] * this.matrix[11] * this.matrix[13] -
      this.matrix[8] * this.matrix[5] * this.matrix[15] +
      this.matrix[8] * this.matrix[7] * this.matrix[13] +
      this.matrix[12] * this.matrix[5] * this.matrix[11] -
      this.matrix[12] * this.matrix[7] * this.matrix[9];

    data[12] =
      -this.matrix[4] * this.matrix[9] * this.matrix[14] +
      this.matrix[4] * this.matrix[10] * this.matrix[13] +
      this.matrix[8] * this.matrix[5] * this.matrix[14] -
      this.matrix[8] * this.matrix[6] * this.matrix[13] -
      this.matrix[12] * this.matrix[5] * this.matrix[10] +
      this.matrix[12] * this.matrix[6] * this.matrix[9];

    data[1] =
      -this.matrix[1] * this.matrix[10] * this.matrix[15] +
      this.matrix[1] * this.matrix[11] * this.matrix[14] +
      this.matrix[9] * this.matrix[2] * this.matrix[15] -
      this.matrix[9] * this.matrix[3] * this.matrix[14] -
      this.matrix[13] * this.matrix[2] * this.matrix[11] +
      this.matrix[13] * this.matrix[3] * this.matrix[10];

    data[5] =
      this.matrix[0] * this.matrix[10] * this.matrix[15] -
      this.matrix[0] * this.matrix[11] * this.matrix[14] -
      this.matrix[8] * this.matrix[2] * this.matrix[15] +
      this.matrix[8] * this.matrix[3] * this.matrix[14] +
      this.matrix[12] * this.matrix[2] * this.matrix[11] -
      this.matrix[12] * this.matrix[3] * this.matrix[10];

    data[9] =
      -this.matrix[0] * this.matrix[9] * this.matrix[15] +
      this.matrix[0] * this.matrix[11] * this.matrix[13] +
      this.matrix[8] * this.matrix[1] * this.matrix[15] -
      this.matrix[8] * this.matrix[3] * this.matrix[13] -
      this.matrix[12] * this.matrix[1] * this.matrix[11] +
      this.matrix[12] * this.matrix[3] * this.matrix[9];

    data[13] =
      this.matrix[0] * this.matrix[9] * this.matrix[14] -
      this.matrix[0] * this.matrix[10] * this.matrix[13] -
      this.matrix[8] * this.matrix[1] * this.matrix[14] +
      this.matrix[8] * this.matrix[2] * this.matrix[13] +
      this.matrix[12] * this.matrix[1] * this.matrix[10] -
      this.matrix[12] * this.matrix[2] * this.matrix[9];

    data[2] =
      this.matrix[1] * this.matrix[6] * this.matrix[15] -
      this.matrix[1] * this.matrix[7] * this.matrix[14] -
      this.matrix[5] * this.matrix[2] * this.matrix[15] +
      this.matrix[5] * this.matrix[3] * this.matrix[14] +
      this.matrix[13] * this.matrix[2] * this.matrix[7] -
      this.matrix[13] * this.matrix[3] * this.matrix[6];

    data[6] =
      -this.matrix[0] * this.matrix[6] * this.matrix[15] +
      this.matrix[0] * this.matrix[7] * this.matrix[14] +
      this.matrix[4] * this.matrix[2] * this.matrix[15] -
      this.matrix[4] * this.matrix[3] * this.matrix[14] -
      this.matrix[12] * this.matrix[2] * this.matrix[7] +
      this.matrix[12] * this.matrix[3] * this.matrix[6];

    data[10] =
      this.matrix[0] * this.matrix[5] * this.matrix[15] -
      this.matrix[0] * this.matrix[7] * this.matrix[13] -
      this.matrix[4] * this.matrix[1] * this.matrix[15] +
      this.matrix[4] * this.matrix[3] * this.matrix[13] +
      this.matrix[12] * this.matrix[1] * this.matrix[7] -
      this.matrix[12] * this.matrix[3] * this.matrix[5];

    data[14] =
      -this.matrix[0] * this.matrix[5] * this.matrix[14] +
      this.matrix[0] * this.matrix[6] * this.matrix[13] +
      this.matrix[4] * this.matrix[1] * this.matrix[14] -
      this.matrix[4] * this.matrix[2] * this.matrix[13] -
      this.matrix[12] * this.matrix[1] * this.matrix[6] +
      this.matrix[12] * this.matrix[2] * this.matrix[5];

    data[3] =
      -this.matrix[1] * this.matrix[6] * this.matrix[11] +
      this.matrix[1] * this.matrix[7] * this.matrix[10] +
      this.matrix[5] * this.matrix[2] * this.matrix[11] -
      this.matrix[5] * this.matrix[3] * this.matrix[10] -
      this.matrix[9] * this.matrix[2] * this.matrix[7] +
      this.matrix[9] * this.matrix[3] * this.matrix[6];

    data[7] =
      this.matrix[0] * this.matrix[6] * this.matrix[11] -
      this.matrix[0] * this.matrix[7] * this.matrix[10] -
      this.matrix[4] * this.matrix[2] * this.matrix[11] +
      this.matrix[4] * this.matrix[3] * this.matrix[10] +
      this.matrix[8] * this.matrix[2] * this.matrix[7] -
      this.matrix[8] * this.matrix[3] * this.matrix[6];

    data[11] =
      -this.matrix[0] * this.matrix[5] * this.matrix[11] +
      this.matrix[0] * this.matrix[7] * this.matrix[9] +
      this.matrix[4] * this.matrix[1] * this.matrix[11] -
      this.matrix[4] * this.matrix[3] * this.matrix[9] -
      this.matrix[8] * this.matrix[1] * this.matrix[7] +
      this.matrix[8] * this.matrix[3] * this.matrix[5];

    data[15] =
      this.matrix[0] * this.matrix[5] * this.matrix[10] -
      this.matrix[0] * this.matrix[6] * this.matrix[9] -
      this.matrix[4] * this.matrix[1] * this.matrix[10] +
      this.matrix[4] * this.matrix[2] * this.matrix[9] +
      this.matrix[8] * this.matrix[1] * this.matrix[6] -
      this.matrix[8] * this.matrix[2] * this.matrix[5];

    det =
      this.matrix[0] * data[0] +
      this.matrix[1] * data[4] +
      this.matrix[2] * data[8] +
      this.matrix[3] * data[12];
    if (det == 0) throw new Error("Error: Mat4 Invert determinant equals 0");
    det = 1.0 / det;
    for (let i = 0; i < 16; i++) data[i] = data[i] * det;
    return new Mat4(data);
  }
  transform(vec: number[]) {
    const result: number[] = [];

    result[0] =
      this.matrix[0] * vec[0] +
      this.matrix[4] * vec[1] +
      this.matrix[8] * vec[2] +
      this.matrix[12] * vec[3];
    result[1] =
      this.matrix[1] * vec[0] +
      this.matrix[5] * vec[1] +
      this.matrix[9] * vec[2] +
      this.matrix[13] * vec[3];
    result[2] =
      this.matrix[2] * vec[0] +
      this.matrix[6] * vec[1] +
      this.matrix[10] * vec[2] +
      this.matrix[14] * vec[3];
    result[3] =
      this.matrix[3] * vec[0] +
      this.matrix[7] * vec[1] +
      this.matrix[11] * vec[2] +
      this.matrix[15] * vec[3];

    return result;
  }
}
