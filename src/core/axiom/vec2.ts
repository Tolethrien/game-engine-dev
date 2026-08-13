export default class Vec2 {
  private static readonly EPSILON = 0.0005;
  private _x: number;
  private _y: number;

  private constructor(x: number, y: number) {
    this._x = x;
    this._y = y;
  }

  //creators

  public static get Zero() {
    return new Vec2(0, 0);
  }
  public static get One() {
    return new Vec2(1, 1);
  }
  public static get XAxis() {
    return new Vec2(1, 0);
  }
  public static get YAxis() {
    return new Vec2(0, 1);
  }
  public static create(x: number, y: number) {
    return new Vec2(x, y);
  }
  public static fromArray(arr: [number, number]) {
    return new Vec2(arr[0], arr[1]);
  }

  //fast calc

  public static add(a: Vec2, b: Vec2) {
    return new Vec2(a._x + b._x, a._y + b._y);
  }
  public static sub(a: Vec2, b: Vec2) {
    return new Vec2(a._x - b._x, a._y - b._y);
  }
  public static lerp(a: Vec2, b: Vec2, t: number) {
    return new Vec2(a._x + (b._x - a._x) * t, a._y + (b._y - a._y) * t);
  }

  clone() {
    return new Vec2(this._x, this._y);
  }

  set(x: number, y: number) {
    this._x = x;
    this._y = y;
    return this;
  }
  setAxis(axis: "x" | "y", val: number) {
    const ax = axis === "x" ? "_x" : "_y";
    this[ax] = val;
    return this;
  }

  copy(v: Vec2) {
    this._x = v._x;
    this._y = v._y;
    return this;
  }

  add(v: Vec2): this;
  add(x: number, y: number): this;
  add(vOrX: Vec2 | number, y?: number) {
    if (typeof vOrX === "number") {
      this._x += vOrX;
      this._y += y ?? 0;
    } else {
      this._x += vOrX._x;
      this._y += vOrX._y;
    }
    return this;
  }

  sub(v: Vec2): this;
  sub(x: number, y: number): this;
  sub(vOrX: Vec2 | number, y?: number) {
    if (typeof vOrX === "number") {
      this._x -= vOrX;
      this._y -= y ?? 0;
    } else {
      this._x -= vOrX._x;
      this._y -= vOrX._y;
    }
    return this;
  }

  scale(scalar: number) {
    this._x *= scalar;
    this._y *= scalar;
    return this;
  }

  divideScalar(scalar: number) {
    if (scalar === 0) throw new Error("Vec2 Error: division by zero");
    this._x /= scalar;
    this._y /= scalar;
    return this;
  }

  negate() {
    this._x = -this._x;
    this._y = -this._y;
    return this;
  }
  negateAxis(axis: "x" | "y") {
    const ax = axis === "x" ? "_x" : "_y";
    this[ax] = -this[ax];
    return this;
  }

  normalize() {
    const len = this.length();
    if (len === 0) return this;
    return this.divideScalar(len);
  }

  perpendicular() {
    const x = this._x;
    this._x = -this._y;
    this._y = x;
    return this;
  }

  lerp(target: Vec2, t: number) {
    this._x += (target._x - this._x) * t;
    this._y += (target._y - this._y) * t;
    return this;
  }

  round() {
    this._x = Math.round(this._x);
    this._y = Math.round(this._y);
    return this;
  }

  rotate(angle: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this._x;
    const y = this._y;
    this._x = x * cos - y * sin;
    this._y = x * sin + y * cos;
    return this;
  }

  clampLength(max: number) {
    const lengthSquared = this.lengthSquared();
    if (lengthSquared > max * max) {
      this.scale(max / Math.sqrt(lengthSquared));
    }
    return this;
  }

  reflect(normal: Vec2) {
    const dot2 = 2 * this.dot(normal);
    this._x -= dot2 * normal.x;
    this._y -= dot2 * normal.y;
    return this;
  }

  //reads

  angle() {
    return Math.atan2(this._y, this._x);
  }
  length() {
    return Math.sqrt(this._x ** 2 + this._y ** 2);
  }

  lengthSquared() {
    return this._x ** 2 + this._y ** 2;
  }

  dot(v: Vec2) {
    return this._x * v._x + this._y * v._y;
  }

  cross(v: Vec2) {
    return this._x * v._y - this._y * v._x;
  }

  distanceTo(v: Vec2) {
    return Math.sqrt((this._x - v._x) ** 2 + (this._y - v._y) ** 2);
  }

  distanceToSquared(v: Vec2) {
    return (this._x - v._x) ** 2 + (this._y - v._y) ** 2;
  }

  isZero() {
    return this._x === 0 && this._y === 0;
  }

  equals(v: Vec2) {
    return this._x === v._x && this._y === v._y;
  }

  equalsApprox(v: Vec2, epsilon = Vec2.EPSILON) {
    return this.distanceToSquared(v) < epsilon ** 2;
  }

  toArray(): [number, number] {
    return [this._x, this._y];
  }
  get value() {
    return { x: this._x, y: this._y };
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
}
