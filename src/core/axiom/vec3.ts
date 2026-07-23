export default class Vec3 {
  private static readonly EPSILON = 0.0005;
  private _x: number;
  private _y: number;
  private _z: number;

  private constructor(x: number, y: number, z: number) {
    this._x = x;
    this._y = y;
    this._z = z;
  }

  public static get Zero() {
    return Vec3.create(0, 0, 0);
  }
  public static get One() {
    return Vec3.create(1, 1, 1);
  }
  public static get XAxis() {
    return Vec3.create(1, 0, 0);
  }
  public static get YAxis() {
    return Vec3.create(0, 1, 0);
  }
  public static get ZAxis() {
    return Vec3.create(0, 0, 1);
  }
  static create(x: number, y: number, z: number) {
    return new Vec3(x, y, z);
  }
  static fromArray(arr: [number, number, number]) {
    return Vec3.create(arr[0], arr[1], arr[2]);
  }

  static add(a: Vec3, b: Vec3) {
    return Vec3.create(a._x + b._x, a._y + b._y, a._z + b._z);
  }
  static sub(a: Vec3, b: Vec3) {
    return Vec3.create(a._x - b._x, a._y - b._y, a._z - b._z);
  }
  static cross(a: Vec3, b: Vec3) {
    return Vec3.create(
      a._y * b._z - a._z * b._y,
      a._z * b._x - a._x * b._z,
      a._x * b._y - a._y * b._x,
    );
  }
  static lerp(a: Vec3, b: Vec3, t: number) {
    return Vec3.create(
      a._x + (b._x - a._x) * t,
      a._y + (b._y - a._y) * t,
      a._z + (b._z - a._z) * t,
    );
  }

  clone() {
    return Vec3.create(this._x, this._y, this._z);
  }

  set(x: number, y: number, z: number) {
    this._x = x;
    this._y = y;
    this._z = z;
    return this;
  }
  setAxis(axis: "x" | "y" | "z", val: number) {
    if (axis === "x") {
      this._x = val;
      return this;
    }
    if (axis === "y") {
      this._y = val;
      return this;
    }
    if (axis === "z") {
      this._z = val;
      return this;
    }
  }

  copy(v: Vec3) {
    this._x = v._x;
    this._y = v._y;
    this._z = v._z;
    return this;
  }

  add(v: Vec3) {
    this._x += v._x;
    this._y += v._y;
    this._z += v._z;
    return this;
  }

  sub(v: Vec3) {
    this._x -= v._x;
    this._y -= v._y;
    this._z -= v._z;
    return this;
  }

  scale(scalar: number) {
    this._x *= scalar;
    this._y *= scalar;
    this._z *= scalar;
    return this;
  }

  divideScalar(scalar: number) {
    if (scalar === 0) throw new Error("Vec3 Error: division by zero");
    this._x /= scalar;
    this._y /= scalar;
    this._z /= scalar;
    return this;
  }

  negate() {
    this._x = -this._x;
    this._y = -this._y;
    this._z = -this._z;
    return this;
  }
  negateAxis(axis: "x" | "y" | "z") {
    if (axis === "x") {
      this._x = -this._x;
      return this;
    }
    if (axis === "y") {
      this._y = -this._y;
      return this;
    }
    if (axis === "z") {
      this._z = -this._z;
      return this;
    }
    return this;
  }
  rotate(axis: Vec3, angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x = this._x,
      y = this._y,
      z = this._z;
    const ax = axis.x,
      ay = axis.y,
      az = axis.z;
    const dot = x * ax + y * ay + z * az;

    const crossX = ay * z - az * y;
    const crossY = az * x - ax * z;
    const crossZ = ax * y - ay * x;

    this._x = x * cos + crossX * sin + ax * dot * (1 - cos);
    this._y = y * cos + crossY * sin + ay * dot * (1 - cos);
    this._z = z * cos + crossZ * sin + az * dot * (1 - cos);
    return this;
  }

  clampLength(max: number) {
    const lengthSquared = this.lengthSquared();
    if (lengthSquared > max * max) {
      this.scale(max / Math.sqrt(lengthSquared));
    }
    return this;
  }

  reflect(normal: Vec3) {
    const dot2 = 2 * this.dot(normal);
    this._x -= dot2 * normal.x;
    this._y -= dot2 * normal.y;
    this._z -= dot2 * normal.z;
    return this;
  }

  normalize() {
    const len = this.length();
    if (len === 0) return this;
    return this.divideScalar(len);
  }
  angleTo(v: Vec3) {
    const denom = Math.sqrt(this.lengthSquared() * v.lengthSquared());
    if (denom === 0) return 0;
    const cos = Math.min(Math.max(this.dot(v) / denom, -1), 1);
    return Math.acos(cos);
  }

  /** mutuje this na cross(this, v) — dla czystej wersji użyj Vec3.cross(a, b) */
  // cross(v: Vec3) {
  //   const x = this.y * v.z - this.z * v.y;
  //   const y = this.z * v.x - this.x * v.z;
  //   const z = this.x * v.y - this.y * v.x;
  //   this.x = x;
  //   this.y = y;
  //   this.z = z;
  //   return this;
  // }

  lerp(target: Vec3, t: number) {
    this._x += (target._x - this._x) * t;
    this._y += (target._y - this._y) * t;
    this._z += (target._z - this._z) * t;
    return this;
  }

  round() {
    this._x = Math.round(this._x);
    this._y = Math.round(this._y);
    this._z = Math.round(this._z);
    return this;
  }

  length() {
    return Math.sqrt(this._x ** 2 + this._y ** 2 + this._z ** 2);
  }

  lengthSquared() {
    return this._x ** 2 + this._y ** 2 + this._z ** 2;
  }

  dot(v: Vec3) {
    return this._x * v._x + this._y * v._y + this._z * v._z;
  }

  distanceTo(v: Vec3) {
    return Math.sqrt(
      (this._x - v._x) ** 2 + (this._y - v._y) ** 2 + (this._z - v._z) ** 2,
    );
  }

  distanceToSquared(v: Vec3) {
    return (
      (this._x - v._x) ** 2 + (this._y - v._y) ** 2 + (this._z - v._z) ** 2
    );
  }

  isZero() {
    return this._x === 0 && this._y === 0 && this._z === 0;
  }

  equals(v: Vec3) {
    return this._x === v._x && this._y === v._y && this._z === v._z;
  }

  equalsApprox(v: Vec3, epsilon = Vec3.EPSILON) {
    return this.distanceToSquared(v) < epsilon ** 2;
  }

  toArray(): [number, number, number] {
    return [this._x, this._y, this._z];
  }
  get value() {
    return { x: this._x, y: this._y, z: this._z };
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  get z() {
    return this._z;
  }
  get xy() {
    return { x: this._x, y: this._y };
  }
}
