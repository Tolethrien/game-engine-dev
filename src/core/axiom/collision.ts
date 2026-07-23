import Vec2 from "./vec2";
import AxiomMath from "./math";

type CollisionManifold = {
  collided: boolean;
  normal: Vec2;
  penetration: number;
};

type RaycastHit = {
  hit: boolean;
  point: Position2D;
  distance: number;
  normal: Vec2;
};

type Ray = { origin: Position2D; direction: Vec2 };

export default class Collision {
  private constructor() {}

  private static noHit(): CollisionManifold {
    return { collided: false, normal: Vec2.Zero, penetration: 0 };
  }

  private static noRayHit(): RaycastHit {
    return {
      hit: false,
      point: { x: 0, y: 0 },
      distance: Infinity,
      normal: Vec2.Zero,
    };
  }

  private static closestPointOnSegment(
    point: Position2D,
    segStart: Position2D,
    segEnd: Position2D,
  ): Position2D {
    const dx = segEnd.x - segStart.x;
    const dy = segEnd.y - segStart.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return { x: segStart.x, y: segStart.y };
    const t = AxiomMath.clamp(
      ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) /
        lengthSquared,
      0,
      1,
    );
    return { x: segStart.x + t * dx, y: segStart.y + t * dy };
  }

  private static closestPointsSegmentSegment(
    p1: Position2D,
    q1: Position2D,
    p2: Position2D,
    q2: Position2D,
  ): { c1: Position2D; c2: Position2D } {
    const d1x = q1.x - p1.x,
      d1y = q1.y - p1.y;
    const d2x = q2.x - p2.x,
      d2y = q2.y - p2.y;
    const rx = p1.x - p2.x,
      ry = p1.y - p2.y;

    const a = d1x * d1x + d1y * d1y;
    const e = d2x * d2x + d2y * d2y;
    const f = d2x * rx + d2y * ry;

    let s: number, t: number;

    if (a <= 1e-8 && e <= 1e-8) {
      return { c1: p1, c2: p2 };
    }
    if (a <= 1e-8) {
      s = 0;
      t = AxiomMath.clamp(f / e, 0, 1);
    } else {
      const c = d1x * rx + d1y * ry;
      if (e <= 1e-8) {
        t = 0;
        s = AxiomMath.clamp(-c / a, 0, 1);
      } else {
        const b = d1x * d2x + d1y * d2y;
        const denom = a * e - b * b;
        s = denom !== 0 ? AxiomMath.clamp((b * f - c * e) / denom, 0, 1) : 0;
        t = (b * s + f) / e;
        if (t < 0) {
          t = 0;
          s = AxiomMath.clamp(-c / a, 0, 1);
        } else if (t > 1) {
          t = 1;
          s = AxiomMath.clamp((b - c) / a, 0, 1);
        }
      }
    }

    return {
      c1: { x: p1.x + d1x * s, y: p1.y + d1y * s },
      c2: { x: p2.x + d2x * t, y: p2.y + d2y * t },
    };
  }

  private static getRectCorners(rect: Rect): Position2D[] {
    const halfW = rect.w / 2;
    const halfH = rect.h / 2;
    const cos = Math.cos(rect.rotation);
    const sin = Math.sin(rect.rotation);
    const local = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: halfW, y: halfH },
      { x: -halfW, y: halfH },
    ];
    return local.map((c) => ({
      x: rect.x + c.x * cos - c.y * sin,
      y: rect.y + c.x * sin + c.y * cos,
    }));
  }

  private static getRectAxes(rect: Rect): Position2D[] {
    const cos = Math.cos(rect.rotation);
    const sin = Math.sin(rect.rotation);
    return [
      { x: cos, y: sin },
      { x: -sin, y: cos },
    ];
  }

  private static projectOntoAxis(
    corners: Position2D[],
    axis: Position2D,
  ): { min: number; max: number } {
    let min = Infinity,
      max = -Infinity;
    for (const corner of corners) {
      const proj = corner.x * axis.x + corner.y * axis.y;
      min = Math.min(min, proj);
      max = Math.max(max, proj);
    }
    return { min, max };
  }

  // ============ POINT ============

  static pointVsCircle(point: Position2D, circle: Circle): CollisionManifold {
    const dx = circle.x - point.x;
    const dy = circle.y - point.y;
    const distSquared = dx * dx + dy * dy;
    if (distSquared > circle.r * circle.r) return Collision.noHit();

    const dist = Math.sqrt(distSquared);
    const normal = dist === 0 ? Vec2.XAxis : Vec2.create(dx / dist, dy / dist);
    return { collided: true, normal, penetration: circle.r - dist };
  }

  static pointVsRect(point: Position2D, rect: Rect): CollisionManifold {
    const cos = Math.cos(-rect.rotation);
    const sin = Math.sin(-rect.rotation);
    const dx0 = point.x - rect.x;
    const dy0 = point.y - rect.y;
    const local = { x: dx0 * cos - dy0 * sin, y: dx0 * sin + dy0 * cos };

    const halfW = rect.w / 2;
    const halfH = rect.h / 2;

    if (Math.abs(local.x) > halfW || Math.abs(local.y) > halfH)
      return Collision.noHit();

    const penX = halfW - Math.abs(local.x);
    const penY = halfH - Math.abs(local.y);

    let localNormal: Position2D;
    let penetration: number;
    if (penX < penY) {
      localNormal = { x: -(Math.sign(local.x) || 1), y: 0 };
      penetration = penX;
    } else {
      localNormal = { x: 0, y: -(Math.sign(local.y) || 1) };
      penetration = penY;
    }

    const cosF = Math.cos(rect.rotation);
    const sinF = Math.sin(rect.rotation);
    const normal = Vec2.create(
      localNormal.x * cosF - localNormal.y * sinF,
      localNormal.x * sinF + localNormal.y * cosF,
    );

    return { collided: true, normal, penetration };
  }

  static pointVsCapsule(
    point: Position2D,
    capsule: Capsule,
  ): CollisionManifold {
    const closest = Collision.closestPointOnSegment(
      point,
      capsule.a,
      capsule.b,
    );
    return Collision.pointVsCircle(point, {
      x: closest.x,
      y: closest.y,
      r: capsule.radius,
    });
  }

  // ============ CIRCLE ============

  static circleVsCircle(a: Circle, b: Circle): CollisionManifold {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSquared = dx * dx + dy * dy;
    const radiusSum = a.r + b.r;
    if (distSquared > radiusSum * radiusSum) return Collision.noHit();

    const dist = Math.sqrt(distSquared);
    const normal = dist === 0 ? Vec2.XAxis : Vec2.create(dx / dist, dy / dist);
    return { collided: true, normal, penetration: radiusSum - dist };
  }

  static circleVsRect(circle: Circle, rect: Rect): CollisionManifold {
    const cos = Math.cos(-rect.rotation);
    const sin = Math.sin(-rect.rotation);
    const dx0 = circle.x - rect.x;
    const dy0 = circle.y - rect.y;
    const local = { x: dx0 * cos - dy0 * sin, y: dx0 * sin + dy0 * cos };

    const halfW = rect.w / 2;
    const halfH = rect.h / 2;

    const closestLocal = {
      x: AxiomMath.clamp(local.x, -halfW, halfW),
      y: AxiomMath.clamp(local.y, -halfH, halfH),
    };

    const dx = closestLocal.x - local.x;
    const dy = closestLocal.y - local.y;
    const distSquared = dx * dx + dy * dy;

    if (distSquared > circle.r * circle.r) return Collision.noHit();

    let localNormal: Position2D;
    let penetration: number;

    if (distSquared < 1e-12) {
      const penX = halfW - Math.abs(local.x);
      const penY = halfH - Math.abs(local.y);
      if (penX < penY) {
        localNormal = { x: -(Math.sign(local.x) || 1), y: 0 };
        penetration = penX + circle.r;
      } else {
        localNormal = { x: 0, y: -(Math.sign(local.y) || 1) };
        penetration = penY + circle.r;
      }
    } else {
      const dist = Math.sqrt(distSquared);
      localNormal = { x: dx / dist, y: dy / dist };
      penetration = circle.r - dist;
    }

    const cosF = Math.cos(rect.rotation);
    const sinF = Math.sin(rect.rotation);
    const normal = Vec2.create(
      localNormal.x * cosF - localNormal.y * sinF,
      localNormal.x * sinF + localNormal.y * cosF,
    );

    return { collided: true, normal, penetration };
  }

  static circleVsCapsule(circle: Circle, capsule: Capsule): CollisionManifold {
    const closest = Collision.closestPointOnSegment(
      { x: circle.x, y: circle.y },
      capsule.a,
      capsule.b,
    );
    return Collision.circleVsCircle(circle, {
      x: closest.x,
      y: closest.y,
      r: capsule.radius,
    });
  }

  // ============ RECT ============

  static rectVsRect(a: Rect, b: Rect): CollisionManifold {
    const cornersA = Collision.getRectCorners(a);
    const cornersB = Collision.getRectCorners(b);
    const axes = [...Collision.getRectAxes(a), ...Collision.getRectAxes(b)];

    let minOverlap = Infinity;
    let smallestAxis: Position2D = { x: 1, y: 0 };

    for (const axis of axes) {
      const projA = Collision.projectOntoAxis(cornersA, axis);
      const projB = Collision.projectOntoAxis(cornersB, axis);

      const overlap =
        Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
      if (overlap <= 0) return Collision.noHit();

      if (overlap < minOverlap) {
        minOverlap = overlap;
        smallestAxis = axis;
      }
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const sign = dx * smallestAxis.x + dy * smallestAxis.y < 0 ? -1 : 1;

    return {
      collided: true,
      normal: Vec2.create(smallestAxis.x * sign, smallestAxis.y * sign),
      penetration: minOverlap,
    };
  }

  static rectVsCapsule(rect: Rect, capsule: Capsule): CollisionManifold {
    const corners = Collision.getRectCorners(rect);

    let closest: Position2D = capsule.a;
    let bestDistSq = Infinity;

    for (let i = 0; i < 4; i++) {
      const { c1, c2 } = Collision.closestPointsSegmentSegment(
        capsule.a,
        capsule.b,
        corners[i],
        corners[(i + 1) % 4],
      );
      const dx = c1.x - c2.x;
      const dy = c1.y - c2.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        closest = c1;
      }
    }

    // segment może leżeć całkowicie wewnątrz recta, nie przecinając żadnej krawędzi
    if (Collision.pointVsRect(capsule.a, rect).collided) closest = capsule.a;

    const result = Collision.circleVsRect(
      { x: closest.x, y: closest.y, r: capsule.radius },
      rect,
    );
    if (!result.collided) return result;
    return {
      collided: true,
      normal: result.normal.clone().negate(),
      penetration: result.penetration,
    };
  }

  // ============ CAPSULE ============

  static capsuleVsCapsule(a: Capsule, b: Capsule): CollisionManifold {
    const { c1, c2 } = Collision.closestPointsSegmentSegment(
      a.a,
      a.b,
      b.a,
      b.b,
    );
    return Collision.circleVsCircle(
      { x: c1.x, y: c1.y, r: a.radius },
      { x: c2.x, y: c2.y, r: b.radius },
    );
  }

  // ============ RAYCAST ============

  static raycastCircle(ray: Ray, circle: Circle): RaycastHit {
    const ox = ray.origin.x - circle.x;
    const oy = ray.origin.y - circle.y;
    const dx = ray.direction.x;
    const dy = ray.direction.y;

    const b = 2 * (ox * dx + oy * dy);
    const c = ox * ox + oy * oy - circle.r * circle.r;
    const discriminant = b * b - 4 * c;

    if (discriminant < 0) return Collision.noRayHit();

    const sqrtDisc = Math.sqrt(discriminant);
    let t = (-b - sqrtDisc) / 2;
    if (t < 0) t = (-b + sqrtDisc) / 2;
    if (t < 0) return Collision.noRayHit();

    const point = { x: ray.origin.x + dx * t, y: ray.origin.y + dy * t };
    const normal = Vec2.create(
      (point.x - circle.x) / circle.r,
      (point.y - circle.y) / circle.r,
    );

    return { hit: true, point, distance: t, normal };
  }

  static raycastRect(ray: Ray, rect: Rect): RaycastHit {
    const cos = Math.cos(-rect.rotation);
    const sin = Math.sin(-rect.rotation);
    const ox = ray.origin.x - rect.x;
    const oy = ray.origin.y - rect.y;
    const localOrigin = { x: ox * cos - oy * sin, y: ox * sin + oy * cos };
    const localDir = {
      x: ray.direction.x * cos - ray.direction.y * sin,
      y: ray.direction.x * sin + ray.direction.y * cos,
    };

    const halfW = rect.w / 2;
    const halfH = rect.h / 2;

    let tMin = -Infinity;
    let tMax = Infinity;
    let hitAxis: "x" | "y" = "x";
    let hitSign = 1;

    for (const axis of ["x", "y"] as const) {
      const originAxis = localOrigin[axis];
      const dirAxis = localDir[axis];
      const half = axis === "x" ? halfW : halfH;

      if (Math.abs(dirAxis) < 1e-8) {
        if (originAxis < -half || originAxis > half)
          return Collision.noRayHit();
      } else {
        let t1 = (-half - originAxis) / dirAxis;
        let t2 = (half - originAxis) / dirAxis;
        let sign = -1;
        if (t1 > t2) {
          [t1, t2] = [t2, t1];
          sign = 1;
        }

        if (t1 > tMin) {
          tMin = t1;
          hitAxis = axis;
          hitSign = sign;
        }
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) return Collision.noRayHit();
      }
    }

    if (tMin < 0) return Collision.noRayHit();

    const localPoint = {
      x: localOrigin.x + localDir.x * tMin,
      y: localOrigin.y + localDir.y * tMin,
    };
    const localNormal =
      hitAxis === "x" ? { x: hitSign, y: 0 } : { x: 0, y: hitSign };

    const cosF = Math.cos(rect.rotation);
    const sinF = Math.sin(rect.rotation);
    const point = {
      x: rect.x + localPoint.x * cosF - localPoint.y * sinF,
      y: rect.y + localPoint.x * sinF + localPoint.y * cosF,
    };
    const normal = Vec2.create(
      localNormal.x * cosF - localNormal.y * sinF,
      localNormal.x * sinF + localNormal.y * cosF,
    );

    return { hit: true, point, distance: tMin, normal };
  }

  static raycastCapsule(ray: Ray, capsule: Capsule): RaycastHit {
    const dSegX = capsule.b.x - capsule.a.x;
    const dSegY = capsule.b.y - capsule.a.y;
    const segLength = Math.sqrt(dSegX * dSegX + dSegY * dSegY);

    let best: RaycastHit = Collision.noRayHit();
    const consider = (hit: RaycastHit) => {
      if (
        hit.hit &&
        hit.distance >= 0 &&
        (!best.hit || hit.distance < best.distance)
      )
        best = hit;
    };

    consider(
      Collision.raycastCircle(ray, {
        x: capsule.a.x,
        y: capsule.a.y,
        r: capsule.radius,
      }),
    );
    consider(
      Collision.raycastCircle(ray, {
        x: capsule.b.x,
        y: capsule.b.y,
        r: capsule.radius,
      }),
    );

    if (segLength > 1e-8) {
      const dHatX = dSegX / segLength;
      const dHatY = dSegY / segLength;

      const qx = ray.origin.x - capsule.a.x;
      const qy = ray.origin.y - capsule.a.y;

      const crossQ = qx * dHatY - qy * dHatX;
      const crossD = ray.direction.x * dHatY - ray.direction.y * dHatX;

      if (Math.abs(crossD) > 1e-8) {
        for (const side of [capsule.radius, -capsule.radius]) {
          const t = (side - crossQ) / crossD;
          if (t < 0) continue;

          const px = ray.origin.x + ray.direction.x * t;
          const py = ray.origin.y + ray.direction.y * t;
          const proj = (px - capsule.a.x) * dHatX + (py - capsule.a.y) * dHatY;

          if (proj >= 0 && proj <= segLength) {
            const sign = side > 0 ? 1 : -1;
            consider({
              hit: true,
              point: { x: px, y: py },
              distance: t,
              normal: Vec2.create(dHatY * sign, -dHatX * sign),
            });
          }
        }
      }
    }

    return best;
  }
}
