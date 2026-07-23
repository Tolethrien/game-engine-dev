import AxiomMath from "./math";

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export default class AABB {
  private constructor() {}

  static overlaps(a: Box | BoxAABB, b: Box | BoxAABB) {
    const boundsA = this.toBounds(a);
    const boundsB = this.toBounds(b);
    return (
      boundsA.minX <= boundsB.maxX &&
      boundsA.maxX >= boundsB.minX &&
      boundsA.minY <= boundsB.maxY &&
      boundsA.maxY >= boundsB.minY
    );
  }

  static contains(a: Box | BoxAABB, b: Box | BoxAABB) {
    const boundsA = this.toBounds(a);
    const boundsB = this.toBounds(b);
    return (
      boundsB.minX >= boundsA.minX &&
      boundsB.maxX <= boundsA.maxX &&
      boundsB.minY >= boundsA.minY &&
      boundsB.maxY <= boundsA.maxY
    );
  }

  static containsPoint(shape: Box | BoxAABB, point: Position2D) {
    const bounds = this.toBounds(shape);
    return (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY
    );
  }

  static closestPoint(shape: Box | BoxAABB, point: Position2D): Position2D {
    const bounds = this.toBounds(shape);
    return {
      x: AxiomMath.clamp(point.x, bounds.minX, bounds.maxX),
      y: AxiomMath.clamp(point.y, bounds.minY, bounds.maxY),
    };
  }

  static intersectsCircle(shape: Box | BoxAABB, circle: Circle) {
    const circlePos: Position2D = { x: circle.x, y: circle.y };
    const closest = AABB.closestPoint(shape, circlePos);
    return (
      AxiomMath.distanceSquared2d(circlePos, closest) <= circle.r * circle.r
    );
  }
  static containsCircle(shape: Box | BoxAABB, circle: Circle) {
    const bounds = this.toBounds(shape);
    return (
      circle.x - circle.r >= bounds.minX &&
      circle.x + circle.r <= bounds.maxX &&
      circle.y - circle.r >= bounds.minY &&
      circle.y + circle.r <= bounds.maxY
    );
  }

  static getCenter(shape: Box | BoxAABB): Position2D {
    const bounds = this.toBounds(shape);
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    };
  }

  static getIntersection(a: Box | BoxAABB, b: Box | BoxAABB): BoxAABB | null {
    if (!AABB.overlaps(a, b)) return null;
    const boundsA = this.toBounds(a);
    const boundsB = this.toBounds(b);
    return {
      min: {
        x: Math.max(boundsA.minX, boundsB.minX),
        y: Math.max(boundsA.minY, boundsB.minY),
      },
      max: {
        x: Math.min(boundsA.maxX, boundsB.maxX),
        y: Math.min(boundsA.maxY, boundsB.maxY),
      },
    };
  }
  private static toBounds(shape: Box | BoxAABB): Bounds {
    if ("min" in shape) {
      return {
        minX: shape.min.x,
        minY: shape.min.y,
        maxX: shape.max.x,
        maxY: shape.max.y,
      };
    }
    return {
      minX: shape.x,
      minY: shape.y,
      maxX: shape.x + shape.w,
      maxY: shape.y + shape.h,
    };
  }
}
