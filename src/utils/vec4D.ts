const EPSILON = 0.001;
type ArrayVec4 = [number, number, number, number];

export default class Vec4D {
  private vecX: number;
  private vecY: number;
  private vecZ: number;
  private vecW: number;
  static readonly Zero: Vec4D = new Vec4D([0, 0, 0, 0]);
  static readonly NormalX: Vec4D = new Vec4D([1, 0, 0, 0]);
  static readonly NormalY: Vec4D = new Vec4D([0, 1, 0, 0]);
  static readonly NormalZ: Vec4D = new Vec4D([0, 0, 1, 0]);
  static readonly NormalW: Vec4D = new Vec4D([0, 0, 0, 1]);
  constructor(vec: Vec4D | ArrayVec4) {
    if (Array.isArray(vec)) {
      this.vecX = vec[0];
      this.vecY = vec[1];
      this.vecZ = vec[2];
      this.vecW = vec[3];
    } else {
      this.vecX = vec.x;
      this.vecY = vec.y;
      this.vecZ = vec.z;
      this.vecW = vec.w;
    }
  }

  public static create(vec: ArrayVec4) {
    return new Vec4D([vec[0], vec[1], vec[2], vec[3]]);
  }
  add(targetVec: Vec4D | ArrayVec4): Vec4D {
    if (Array.isArray(targetVec)) {
      return new Vec4D([
        this.vecX + targetVec[0],
        this.vecY + targetVec[1],
        this.vecZ + targetVec[2],
        this.vecW + targetVec[3],
      ]);
    } else {
      return new Vec4D([
        this.vecX + targetVec.x,
        this.vecY + targetVec.y,
        this.vecZ + targetVec.z,
        this.vecW + targetVec.w,
      ]);
    }
  }

  sub(targetVec: Vec4D | ArrayVec4) {
    return Array.isArray(targetVec)
      ? new Vec4D([
          this.vecX - targetVec[0],
          this.vecY - targetVec[1],
          this.vecZ - targetVec[2],
          this.vecW - targetVec[3],
        ])
      : new Vec4D([
          this.vecX - targetVec.x,
          this.vecY - targetVec.y,
          this.vecZ - targetVec.z,
          this.vecW - targetVec.w,
        ]);
  }
  length() {
    return Math.sqrt(
      this.vecX ** 2 + this.vecY ** 2 + this.vecZ ** 2 + this.vecW ** 2
    );
  }
  normalize() {
    const length = this.length();
    return length === 0
      ? new Vec4D([0, 0, 0, 0])
      : new Vec4D([
          this.vecX / length,
          this.vecY / length,
          this.vecZ / length,
          this.vecW / length,
        ]);
  }

  multiply(scalar: number) {
    return new Vec4D([
      this.vecX * scalar,
      this.vecY * scalar,
      this.vecZ * scalar,
      this.vecW * scalar,
    ]);
  }
  div(scalar: number) {
    return new Vec4D([
      this.vecX / scalar,
      this.vecY / scalar,
      this.vecZ / scalar,
      this.vecW / scalar,
    ]);
  }
  crosProduct(targetVec: Vec4D | ArrayVec4) {
    return Array.isArray(targetVec)
      ? new Vec4D([
          this.vecY * targetVec[2] - this.vecZ * targetVec[1],
          this.vecZ * targetVec[0] - this.vecX * targetVec[2],
          this.vecX * targetVec[1] - this.vecY * targetVec[0],
          0,
        ])
      : new Vec4D([
          this.vecY * targetVec.z - this.vecZ * targetVec.y,
          this.vecZ * targetVec.x - this.vecX * targetVec.z,
          this.vecX * targetVec.y - this.vecY * targetVec.x,
          0,
        ]);
  }
  dotProduct(targetVec: Vec4D | ArrayVec4) {
    return Array.isArray(targetVec)
      ? this.vecX * targetVec[0] +
          this.vecY * targetVec[1] +
          this.vecZ * targetVec[2] +
          this.vecW * targetVec[3]
      : this.vecX * targetVec.x +
          this.vecY * targetVec.y +
          this.vecZ * targetVec.z +
          this.vecW * targetVec.w;
  }

  distanceToOtherVec4D(other: Vec4D) {
    return Math.sqrt(
      (this.vecX - other.x) ** 2 +
        (this.vecY - other.y) ** 2 +
        (this.vecZ - other.z) ** 2 +
        (this.vecW - other.w) ** 2
    );
  }
  lerp(other: Vec4D, t: number) {
    return this.add(other.sub(this).multiply(t));
  }

  isEqualEpsilon(other: Vec4D, epsilon: number) {
    return (
      Math.abs(this.x - other.x) < epsilon &&
      Math.abs(this.y - other.y) < epsilon &&
      Math.abs(this.z - other.z) < epsilon &&
      Math.abs(this.w - other.w) < epsilon
    );
  }

  isEqual(other: Vec4D) {
    return this.isEqualEpsilon(other, EPSILON);
  }
  get x() {
    return this.vecX;
  }
  get y() {
    return this.vecY;
  }
  get z() {
    return this.vecZ;
  }
  get w() {
    return this.vecW;
  }
}
