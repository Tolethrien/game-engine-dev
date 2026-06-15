export default class Vec2D {
  private static EPSILON = 0.0005;
  private readonly vecX: number;
  private readonly vecY: number;
  static readonly Zero: Vec2D = new Vec2D([0, 0]);
  static readonly NormalX: Vec2D = new Vec2D([1, 0]);
  static readonly NormalY: Vec2D = new Vec2D([0, 1]);

  constructor(vec: Vec2D | [number, number]) {
    if (Array.isArray(vec)) {
      this.vecX = vec[0];
      this.vecY = vec[1];
    } else {
      this.vecX = vec.x;
      this.vecY = vec.y;
    }
  }

  public static create(vec: [number, number]) {
    return new Vec2D([vec[0], vec[1]]);
  }

  add(targetVec: Vec2D | [number, number]) {
    if (Array.isArray(targetVec)) {
      return new Vec2D([this.vecX + targetVec[0], this.vecY + targetVec[1]]);
    } else {
      return new Vec2D([this.vecX + targetVec.x, this.vecY + targetVec.y]);
    }
  }

  set(targetVec: Vec2D | [number, number]) {
    if (Array.isArray(targetVec)) {
      return new Vec2D([targetVec[0], targetVec[1]]);
    } else {
      return new Vec2D([targetVec.x, targetVec.y]);
    }
  }

  setAxis(axis: "x" | "y", value: number) {
    return axis === "x"
      ? new Vec2D([value, this.vecY])
      : new Vec2D([this.vecX, value]);
  }

  sub(targetVec: Vec2D | [number, number]) {
    return Array.isArray(targetVec)
      ? new Vec2D([this.vecX - targetVec[0], this.vecY - targetVec[1]])
      : new Vec2D([this.vecX - targetVec.x, this.vecY - targetVec.y]);
  }

  get get() {
    return {x: this.vecX, y: this.vecY};
  }

  get getRound() {
    return {x: Math.round(this.vecX), y: Math.round(this.vecY)};
  }

  get getNormalize() {
    const length = this.length();
    return length === 0
      ? [0, 0]
      : {x: this.vecX / length, y: this.vecY / length};
  }

  get x() {
    return this.vecX;
  }

  get y() {
    return this.vecY;
  }

  get isZero() {
    return this.vecX === 0 && this.vecY === 0;
  }

  normalize() {
    const length = this.length();
    return length === 0
      ? new Vec2D([0, 0])
      : new Vec2D([this.vecX / length, this.vecY / length]);
  }

  clone() {
    return new Vec2D([this.vecX, this.vecY]);
  }

  multiply(scalar: number) {
    return new Vec2D([this.vecX * scalar, this.vecY * scalar]);
  }

  div(scalar: number) {
    if (scalar === 0) throw new Error("dont devide by 0 you morron xD");
    return new Vec2D([this.vecX / scalar, this.vecY / scalar]);
  }

  isEqual(targetVec: Vec2D) {
    return this.vecX === targetVec.x && this.vecY === targetVec.y;
  }

  isEqualEpsilon(targetVec: Vec2D) {
    return this.distanceSquaredToOtherVec2D(targetVec) < Vec2D.EPSILON ** 2;
  }

  getPerpendicular() {
    return new Vec2D([-this.vecY, this.vecX]);
  }

  crosProduct(targetVec: Vec2D | [number, number]) {
    return Array.isArray(targetVec)
      ? this.vecX * targetVec[1] - this.vecY * targetVec[0]
      : this.vecX * targetVec.y - this.vecY * targetVec.x;
  }

  dotProduct(targetVec: Vec2D | [number, number]) {
    return Array.isArray(targetVec)
      ? this.vecX * targetVec[0] + this.vecY * targetVec[1]
      : this.vecX * targetVec.x + this.vecY * targetVec.y;
  }

  length() {
    return Math.sqrt(this.vecX ** 2 + this.vecY ** 2);
  }

  lengthSquared() {
    return this.vecX ** 2 + this.vecY ** 2;
  }

  oposite() {
    return new Vec2D([-this.vecX, -this.vecY]);
  }

  distanceToOtherVec2D(other: Vec2D) {
    return Math.sqrt((this.vecX - other.x) ** 2 + (this.vecY - other.y) ** 2);
  }

  distanceSquaredToOtherVec2D(other: Vec2D) {
    return (this.vecX - other.x) ** 2 + (this.vecY - other.y) ** 2;
  }
}
