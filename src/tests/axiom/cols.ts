import Collision from "@/core/axiom/collision";
import Vec2 from "@/core/axiom/vec2";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
window.addEventListener("resize", resize);
resize();

type ShapeCircle = {
  kind: "circle";
  id: number;
  x: number;
  y: number;
  r: number;
};
type ShapeRect = {
  kind: "rect";
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};
type ShapeCapsule = {
  kind: "capsule";
  id: number;
  a: Position2D;
  b: Position2D;
  radius: number;
};
type Shape = ShapeCircle | ShapeRect | ShapeCapsule;

let nextId = 1;
let shapes: Shape[] = [
  { kind: "circle", id: nextId++, x: 220, y: 220, r: 50 },
  { kind: "rect", id: nextId++, x: 480, y: 260, w: 160, h: 100, rotation: 0.3 },
  {
    kind: "capsule",
    id: nextId++,
    a: { x: 300, y: 460 },
    b: { x: 500, y: 500 },
    radius: 30,
  },
];
let spawnType: "circle" | "rect" | "capsule" = "circle";

let rayOrigin: Position2D = { x: 60, y: 60 };
const mouse: Position2D = { x: 0, y: 0 };

type DragTarget =
  | { kind: "origin" }
  | { kind: "move"; id: number; startMouse: Position2D; snapshot: Shape }
  | { kind: "circle-resize"; id: number }
  | { kind: "rect-resize"; id: number }
  | { kind: "rect-rotate"; id: number }
  | { kind: "capsule-endpoint"; id: number; which: "a" | "b" }
  | { kind: "capsule-resize"; id: number }
  | null;
let drag: DragTarget = null;

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function nearHandle(p: Position2D, hx: number, hy: number) {
  return dist(p, { x: hx, y: hy }) <= 8;
}
function shapeCenter(s: Shape): Position2D {
  return s.kind === "capsule"
    ? { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
    : { x: s.x, y: s.y };
}
function cloneShape(s: Shape): Shape {
  return s.kind === "capsule"
    ? { ...s, a: { ...s.a }, b: { ...s.b } }
    : { ...s };
}
function closestPointOnSegmentLocal(
  p: Position2D,
  a: Position2D,
  b: Position2D,
): Position2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: a.x, y: a.y };
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
  );
  return { x: a.x + t * dx, y: a.y + t * dy };
}
function rectCorner(rect: ShapeRect): Position2D {
  const halfW = rect.w / 2;
  const halfH = rect.h / 2;
  const cos = Math.cos(rect.rotation);
  const sin = Math.sin(rect.rotation);
  return {
    x: rect.x + halfW * cos - halfH * sin,
    y: rect.y + halfW * sin + halfH * cos,
  };
}
function rectRotateHandle(rect: ShapeRect): Position2D {
  const d = rect.h / 2 + 30;
  return {
    x: rect.x + d * Math.sin(rect.rotation),
    y: rect.y - d * Math.cos(rect.rotation),
  };
}
function capsuleRadiusHandle(c: ShapeCapsule): Position2D {
  const mx = (c.a.x + c.b.x) / 2;
  const my = (c.a.y + c.b.y) / 2;
  const dx = c.b.x - c.a.x;
  const dy = c.b.y - c.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mx + (-dy / len) * c.radius, y: my + (dx / len) * c.radius };
}

// --- dyspozytorzy do prawdziwego API Collision ---
function pointVsShape(
  p: Position2D,
  s: Shape,
): { collided: boolean; normal: Vec2; penetration: number } {
  if (s.kind === "circle") return Collision.pointVsCircle(p, s);
  if (s.kind === "rect") return Collision.pointVsRect(p, s);
  return Collision.pointVsCapsule(p, s);
}
function hitTestShape(p: Position2D, s: Shape): boolean {
  return pointVsShape(p, s).collided;
}
function collide(s1: Shape, s2: Shape) {
  if (s1.kind === "circle" && s2.kind === "circle")
    return Collision.circleVsCircle(s1, s2);
  if (s1.kind === "circle" && s2.kind === "rect")
    return Collision.circleVsRect(s1, s2);
  if (s1.kind === "rect" && s2.kind === "circle") {
    const r = Collision.circleVsRect(s2, s1);
    return r.collided ? { ...r, normal: r.normal.clone().negate() } : r;
  }
  if (s1.kind === "rect" && s2.kind === "rect")
    return Collision.rectVsRect(s1, s2);
  if (s1.kind === "circle" && s2.kind === "capsule")
    return Collision.circleVsCapsule(s1, s2);
  if (s1.kind === "capsule" && s2.kind === "circle") {
    const r = Collision.circleVsCapsule(s2, s1);
    return r.collided ? { ...r, normal: r.normal.clone().negate() } : r;
  }
  if (s1.kind === "rect" && s2.kind === "capsule")
    return Collision.rectVsCapsule(s1, s2);
  if (s1.kind === "capsule" && s2.kind === "rect") {
    const r = Collision.rectVsCapsule(s2, s1);
    return r.collided ? { ...r, normal: r.normal.clone().negate() } : r;
  }
  return Collision.capsuleVsCapsule(s1 as ShapeCapsule, s2 as ShapeCapsule);
}
function raycastShape(ray: { origin: Position2D; direction: Vec2 }, s: Shape) {
  if (s.kind === "circle") return Collision.raycastCircle(ray, s);
  if (s.kind === "rect") return Collision.raycastRect(ray, s);
  return Collision.raycastCapsule(ray, s);
}
function raycastNearest(
  ray: { origin: Position2D; direction: Vec2 },
  list: Shape[],
) {
  let best: { hit: ReturnType<typeof raycastShape>; shape: Shape } | null =
    null;
  for (const s of list) {
    const hit = raycastShape(ray, s);
    if (hit.hit && (!best || hit.distance < best.hit.distance))
      best = { hit, shape: s };
  }
  return best;
}

function spawnShape(p: Position2D) {
  const id = nextId++;
  if (spawnType === "circle")
    shapes.push({ kind: "circle", id, x: p.x, y: p.y, r: 40 });
  else if (spawnType === "rect")
    shapes.push({
      kind: "rect",
      id,
      x: p.x,
      y: p.y,
      w: 120,
      h: 80,
      rotation: 0,
    });
  else
    shapes.push({
      kind: "capsule",
      id,
      a: { x: p.x - 50, y: p.y },
      b: { x: p.x + 50, y: p.y },
      radius: 30,
    });
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  const p = { x: e.offsetX, y: e.offsetY };

  if (e.button === 2) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hitTestShape(p, shapes[i])) {
        shapes.splice(i, 1);
        return;
      }
    }
    return;
  }

  if (nearHandle(p, rayOrigin.x, rayOrigin.y)) {
    drag = { kind: "origin" };
    return;
  }

  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.kind === "circle" && nearHandle(p, s.x + s.r, s.y)) {
      drag = { kind: "circle-resize", id: s.id };
      return;
    }
    if (s.kind === "rect") {
      const corner = rectCorner(s);
      const rot = rectRotateHandle(s);
      if (nearHandle(p, corner.x, corner.y)) {
        drag = { kind: "rect-resize", id: s.id };
        return;
      }
      if (nearHandle(p, rot.x, rot.y)) {
        drag = { kind: "rect-rotate", id: s.id };
        return;
      }
    }
    if (s.kind === "capsule") {
      if (nearHandle(p, s.a.x, s.a.y)) {
        drag = { kind: "capsule-endpoint", id: s.id, which: "a" };
        return;
      }
      if (nearHandle(p, s.b.x, s.b.y)) {
        drag = { kind: "capsule-endpoint", id: s.id, which: "b" };
        return;
      }
      const rh = capsuleRadiusHandle(s);
      if (nearHandle(p, rh.x, rh.y)) {
        drag = { kind: "capsule-resize", id: s.id };
        return;
      }
    }
  }

  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (hitTestShape(p, s)) {
      drag = { kind: "move", id: s.id, startMouse: p, snapshot: cloneShape(s) };
      return;
    }
  }

  spawnShape(p);
});

canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;
  if (!drag) return;

  if (drag.kind === "origin") {
    rayOrigin = { x: mouse.x, y: mouse.y };
    return;
  }
  const dragID = drag.id;
  const s = shapes.find((sh) => sh.id === dragID);
  if (!s) return;

  if (drag.kind === "move") {
    const dx = mouse.x - drag.startMouse.x;
    const dy = mouse.y - drag.startMouse.y;
    if (drag.snapshot.kind === "capsule" && s.kind === "capsule") {
      s.a = { x: drag.snapshot.a.x + dx, y: drag.snapshot.a.y + dy };
      s.b = { x: drag.snapshot.b.x + dx, y: drag.snapshot.b.y + dy };
    } else if (drag.snapshot.kind !== "capsule" && s.kind !== "capsule") {
      s.x = drag.snapshot.x + dx;
      s.y = drag.snapshot.y + dy;
    }
  }
  if (drag.kind === "circle-resize" && s.kind === "circle") {
    s.r = Math.max(8, dist(mouse, s));
  }
  if (drag.kind === "rect-resize" && s.kind === "rect") {
    const cos = Math.cos(-s.rotation);
    const sin = Math.sin(-s.rotation);
    const dx = mouse.x - s.x;
    const dy = mouse.y - s.y;
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    s.w = Math.max(20, Math.abs(localX) * 2);
    s.h = Math.max(20, Math.abs(localY) * 2);
  }
  if (drag.kind === "rect-rotate" && s.kind === "rect") {
    s.rotation = Math.atan2(mouse.x - s.x, -(mouse.y - s.y));
  }
  if (drag.kind === "capsule-endpoint" && s.kind === "capsule") {
    s[drag.which] = { x: mouse.x, y: mouse.y };
  }
  if (drag.kind === "capsule-resize" && s.kind === "capsule") {
    const closest = closestPointOnSegmentLocal(mouse, s.a, s.b);
    s.radius = Math.max(6, dist(mouse, closest));
  }
});

window.addEventListener("mouseup", () => {
  drag = null;
});

window.addEventListener("keydown", (e) => {
  if (e.key === "1") spawnType = "circle";
  if (e.key === "2") spawnType = "rect";
  if (e.key === "3") spawnType = "capsule";
});

function drawHandle(x: number, y: number) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(x - 4, y - 4, 8, 8);
}
function drawDot(x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawShape(
  s: Shape,
  state: { rayHit: boolean; colliding: boolean; containsMouse: boolean },
) {
  const fill = state.rayHit
    ? "rgba(255,212,59,0.5)"
    : state.colliding
      ? "rgba(255,107,107,0.4)"
      : state.containsMouse
        ? "rgba(81,207,102,0.4)"
        : "rgba(77,171,247,0.25)";
  const stroke = state.rayHit
    ? "#ffd43b"
    : state.colliding
      ? "#ff6b6b"
      : "#4dabf7";

  if (s.kind === "circle") {
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
    drawHandle(s.x + s.r, s.y);
  } else if (s.kind === "rect") {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    ctx.fillStyle = fill;
    ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
    const corner = rectCorner(s);
    const rot = rectRotateHandle(s);
    ctx.strokeStyle = "#555";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(rot.x, rot.y);
    ctx.stroke();
    drawHandle(corner.x, corner.y);
    drawHandle(rot.x, rot.y);
  } else {
    const dx = s.b.x - s.a.x;
    const dy = s.b.y - s.a.y;
    const len = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2);
    ctx.rotate(angle);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-len / 2, -s.radius);
    ctx.lineTo(len / 2, -s.radius);
    ctx.arc(len / 2, 0, s.radius, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-len / 2, s.radius);
    ctx.arc(-len / 2, 0, s.radius, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
    ctx.restore();
    drawHandle(s.a.x, s.a.y);
    drawHandle(s.b.x, s.b.y);
    const rh = capsuleRadiusHandle(s);
    drawHandle(rh.x, rh.y);
  }
}

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const dx = mouse.x - rayOrigin.x;
  const dy = mouse.y - rayOrigin.y;
  const len = Math.hypot(dx, dy) || 1;
  const ray = { origin: rayOrigin, direction: Vec2.create(dx / len, dy / len) };
  const nearest = raycastNearest(ray, shapes);

  const collidingIds = new Set<number>();
  const manifolds: { a: Shape; b: Shape; normal: Vec2; penetration: number }[] =
    [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const m = collide(shapes[i], shapes[j]);
      if (m.collided) {
        collidingIds.add(shapes[i].id);
        collidingIds.add(shapes[j].id);
        manifolds.push({
          a: shapes[i],
          b: shapes[j],
          normal: m.normal,
          penetration: m.penetration,
        });
      }
    }
  }

  for (const s of shapes) {
    drawShape(s, {
      rayHit: nearest?.shape.id === s.id,
      colliding: collidingIds.has(s.id),
      containsMouse: pointVsShape(mouse, s).collided,
    });
  }

  ctx.strokeStyle = "#ff6b6b";
  for (const { a, b, normal, penetration } of manifolds) {
    const ca = shapeCenter(a);
    const cb = shapeCenter(b);

    ctx.beginPath();
    ctx.moveTo(ca.x, ca.y);
    ctx.lineTo(
      ca.x - normal.x * (penetration + 20),
      ca.y - normal.y * (penetration + 20),
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cb.x, cb.y);
    ctx.lineTo(
      cb.x + normal.x * (penetration + 20),
      cb.y + normal.y * (penetration + 20),
    );
    ctx.stroke();
  }

  const rayEnd = nearest
    ? nearest.hit.point
    : {
        x: rayOrigin.x + ray.direction.x * 2000,
        y: rayOrigin.y + ray.direction.y * 2000,
      };
  ctx.strokeStyle = nearest ? "#ffd43b" : "rgba(255,255,255,0.3)";
  ctx.setLineDash(nearest ? [] : [6, 6]);
  ctx.beginPath();
  ctx.moveTo(rayOrigin.x, rayOrigin.y);
  ctx.lineTo(rayEnd.x, rayEnd.y);
  ctx.stroke();
  ctx.setLineDash([]);

  if (nearest) {
    drawDot(nearest.hit.point.x, nearest.hit.point.y, "#ffd43b");
    ctx.strokeStyle = "#51cf66";
    ctx.beginPath();
    ctx.moveTo(nearest.hit.point.x, nearest.hit.point.y);
    ctx.lineTo(
      nearest.hit.point.x + nearest.hit.normal.x * 24,
      nearest.hit.point.y + nearest.hit.normal.y * 24,
    );
    ctx.stroke();
  }

  drawHandle(rayOrigin.x, rayOrigin.y);

  ctx.fillStyle = "#fff";
  ctx.font = "13px monospace";
  ctx.fillText(
    `1/2/3 = spawn: koło/prostokąt/kapsuła (teraz: ${spawnType})   LPM puste=dodaj, LPM+drag=przesuń/uchwyty, PPM=usuń`,
    10,
    20,
  );
  ctx.fillText(
    "biały uchwyt z lewej = origin raya (kieruje się na kursor)",
    10,
    38,
  );
  ctx.fillText(
    nearest
      ? `raycastNearest: shape #${nearest.shape.id} (${nearest.shape.kind}), dist=${nearest.hit.distance.toFixed(0)}`
      : `raycastNearest: brak trafienia`,
    10,
    56,
  );
  ctx.fillText(
    `kolidujących par: ${manifolds.length}   kształtów: ${shapes.length}`,
    10,
    74,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
