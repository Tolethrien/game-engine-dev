export default class AxiomMath {
  private static readonly EPSILON = 0.0005;
  static clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }
  static map(
    value: number,
    fromMin: number,
    fromMax: number,
    toMin: number,
    toMax: number,
    clamp = false,
  ) {
    const result =
      toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
    return clamp ? AxiomMath.clamp(result, toMin, toMax) : result;
  }
  static lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }
  static lerpInt(a: number, b: number, t: number) {
    return Math.round(AxiomMath.lerp(a, b, t));
  }
  static lerpPos2D(a: Position2D, b: Position2D, t: number) {
    return {
      x: AxiomMath.lerp(a.x, b.x, t),
      y: AxiomMath.lerp(a.y, b.y, t),
    };
  }
  static lerpPos3D(a: Position3D, b: Position3D, t: number) {
    return {
      x: AxiomMath.lerp(a.x, b.x, t),
      y: AxiomMath.lerp(a.y, b.y, t),
      z: AxiomMath.lerp(a.z, b.z, t),
    };
  }
  static lerpSize2D(a: Size2D, b: Size2D, t: number) {
    return {
      width: AxiomMath.lerp(a.width, b.width, t),
      height: AxiomMath.lerp(a.height, b.height, t),
    };
  }
  static inverseLerp(a: number, b: number, value: number) {
    return a === b ? 0 : (value - a) / (b - a);
  }
  static lerpAngle(a: number, b: number, t: number) {
    const diff = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
    const delta = diff < -Math.PI ? diff + 2 * Math.PI : diff;
    return a + delta * t;
  }
  static lerpRGB(a: RGB, b: RGB, t: number): RGB {
    return [
      AxiomMath.lerp(a[0], b[0], t),
      AxiomMath.lerp(a[1], b[1], t),
      AxiomMath.lerp(a[2], b[2], t),
    ];
  }
  static lerpRGBA(a: RGBA, b: RGBA, t: number): RGBA {
    return [
      AxiomMath.lerp(a[0], b[0], t),
      AxiomMath.lerp(a[1], b[1], t),
      AxiomMath.lerp(a[2], b[2], t),
      AxiomMath.lerp(a[3], b[3], t),
    ];
  }
  static randomFloat(min: number, max: number) {
    return min + Math.random() * (max - min);
  }

  static randomInt(min: number, max: number) {
    return Math.floor(AxiomMath.randomFloat(min, max + 1));
  }
  static degToRad(deg: number) {
    return (deg * Math.PI) / 180;
  }

  static radToDeg(rad: number) {
    return (rad * 180) / Math.PI;
  }

  static approxEquals(a: number, b: number, epsilon = AxiomMath.EPSILON) {
    return Math.abs(a - b) < epsilon;
  }
  static randomSign() {
    return Math.random() < 0.5 ? -1 : 1;
  }
  static randomBool(chance = 0.5) {
    return Math.random() < chance;
  }
  static weightedRandom<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  static randomArrayIndex(array: []) {
    return AxiomMath.randomInt(0, array.length - 1);
  }
  static randomInCirclePoint(center: { x: number; y: number }, radius: number) {
    const angle = AxiomMath.randomFloat(0, Math.PI * 2);
    const r = radius * Math.sqrt(Math.random());
    return {
      x: center.x + r * Math.cos(angle),
      y: center.y + r * Math.sin(angle),
    };
  }

  static randomInRectPoint(shape: Box | BoxAABB) {
    if ("min" in shape) {
      return {
        x: AxiomMath.randomFloat(shape.min.x, shape.max.x),
        y: AxiomMath.randomFloat(shape.min.y, shape.max.y),
      };
    }
    return {
      x: AxiomMath.randomFloat(shape.x, shape.x + shape.w),
      y: AxiomMath.randomFloat(shape.y, shape.y + shape.h),
    };
  }
  static distanceSquared2d(a: Position2D, b: Position2D) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  }

  static distance2d(a: Position2D, b: Position2D) {
    return Math.sqrt(AxiomMath.distanceSquared2d(a, b));
  }

  static distanceSquared3d(a: Position3D, b: Position3D) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
  }

  static distance3d(a: Position3D, b: Position3D) {
    return Math.sqrt(AxiomMath.distanceSquared3d(a, b));
  }
}
