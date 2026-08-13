import Vec2 from "./vec2";

export default class Mat2 {
  private static readonly EPSILON = 0.000001;

  // [a, b, c, d, tx, ty] — column-major: col0=[a,b], col1=[c,d], col2=[tx,ty]
  elements: Float32Array;

  private constructor(data: number[]) {
    this.elements = new Float32Array(data);
  }

  static create(data: number[]) {
    return new Mat2(data);
  }

  static get identity() {
    return Mat2.create([1, 0, 0, 1, 0, 0]);
  }

  static translation(x: number, y: number) {
    return Mat2.create([1, 0, 0, 1, x, y]);
  }

  static rotation(angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return Mat2.create([c, s, -s, c, 0, 0]);
  }

  static scaling(x: number, y: number) {
    return Mat2.create([x, 0, 0, y, 0, 0]);
  }

  static fromTRS(position: Vec2, rotation: number, scale: Vec2) {
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    return Mat2.create([
      scale.x * c,
      scale.x * s,
      -scale.y * s,
      scale.y * c,
      position.x,
      position.y,
    ]);
  }

  clone() {
    return Mat2.create(Array.from(this.elements));
  }

  translate(x: number, y: number) {
    const m = this.elements;
    m[4] = m[0] * x + m[2] * y + m[4];
    m[5] = m[1] * x + m[3] * y + m[5];
    return this;
  }

  rotate(angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m = this.elements;
    const a = m[0],
      b = m[1],
      cc = m[2],
      d = m[3];
    m[0] = a * c + cc * s;
    m[1] = b * c + d * s;
    m[2] = cc * c - a * s;
    m[3] = d * c - b * s;
    return this;
  }

  scale(x: number, y: number) {
    const m = this.elements;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
    return this;
  }

  multiply(other: Mat2) {
    const a = this.elements;
    const b = other.elements;
    const data = [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    this.elements = new Float32Array(data);
    return this;
  }

  invert() {
    const m = this.elements;
    const det = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(det) < Mat2.EPSILON)
      throw new Error("Mat2D invert Error: determinant equals 0");
    const invDet = 1 / det;
    const a = m[3] * invDet;
    const b = -m[1] * invDet;
    const c = -m[2] * invDet;
    const d = m[0] * invDet;
    const tx = -(a * m[4] + c * m[5]);
    const ty = -(b * m[4] + d * m[5]);
    this.elements = new Float32Array([a, b, c, d, tx, ty]);
    return this;
  }

  transformPoint(vec: Vec2): Vec2 {
    const m = this.elements;
    return Vec2.create(
      m[0] * vec.x + m[2] * vec.y + m[4],
      m[1] * vec.x + m[3] * vec.y + m[5],
    );
  }

  // ignoruje translację — do kierunków/prędkości, nie punktów w przestrzeni
  transformVector(vec: Vec2): Vec2 {
    const m = this.elements;
    return Vec2.create(
      m[0] * vec.x + m[2] * vec.y,
      m[1] * vec.x + m[3] * vec.y,
    );
  }

  getPosition() {
    return Vec2.create(this.elements[4], this.elements[5]);
  }
  getRotation() {
    return Math.atan2(this.elements[1], this.elements[0]);
  }
  getScale() {
    const m = this.elements;
    return Vec2.create(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
  }
}
