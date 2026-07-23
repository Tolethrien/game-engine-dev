import Vec2 from "@/core/axiom/vec2";
import AxiomMath from "@/core/axiom/math";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
window.addEventListener("resize", resize);
resize();

const mouse = { x: 0, y: 0 };

// --- sekcja 1+2: dwa wektory z pivota + lerp ---
const pivot = { x: 220, y: 220 };
let tipA = { x: 380, y: 140 };
let tipB = { x: 320, y: 340 };
let dragTarget: "A" | "B" | "mirrorStart" | "mirrorEnd" | "rayStart" | null =
  null;

// --- sekcja 3: reflect demo ---
let mirrorA = { x: 500, y: 380 };
let mirrorB = { x: 720, y: 300 };
let rayStart = { x: 480, y: 480 };

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function nearHandle(p: Position2D, hx: number, hy: number) {
  return dist(p, { x: hx, y: hy }) <= 9;
}
function segmentIntersect(
  p1: Position2D,
  p2: Position2D,
  p3: Position2D,
  p4: Position2D,
): { point: Position2D; t: number } | null {
  const d1x = p2.x - p1.x,
    d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x,
    d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  if (t < 0 || u < 0 || u > 1) return null;
  return { point: { x: p1.x + d1x * t, y: p1.y + d1y * t }, t };
}

canvas.addEventListener("mousedown", (e) => {
  const p = { x: e.offsetX, y: e.offsetY };
  if (nearHandle(p, tipA.x, tipA.y)) dragTarget = "A";
  else if (nearHandle(p, tipB.x, tipB.y)) dragTarget = "B";
  else if (nearHandle(p, mirrorA.x, mirrorA.y)) dragTarget = "mirrorStart";
  else if (nearHandle(p, mirrorB.x, mirrorB.y)) dragTarget = "mirrorEnd";
  else if (nearHandle(p, rayStart.x, rayStart.y)) dragTarget = "rayStart";
});
canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;
  if (dragTarget === "A") tipA = { ...mouse };
  if (dragTarget === "B") tipB = { ...mouse };
  if (dragTarget === "mirrorStart") mirrorA = { ...mouse };
  if (dragTarget === "mirrorEnd") mirrorB = { ...mouse };
  if (dragTarget === "rayStart") rayStart = { ...mouse };
});
window.addEventListener("mouseup", () => {
  dragTarget = null;
});

function drawHandle(x: number, y: number, color = "#fff") {
  ctx.fillStyle = color;
  ctx.fillRect(x - 4, y - 4, 8, 8);
}
function drawArrow(from: Position2D, to: Position2D, color: string) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- 1+2: A, B ---
  const a = Vec2.create(tipA.x - pivot.x, tipA.y - pivot.y);
  const b = Vec2.create(tipB.x - pivot.x, tipB.y - pivot.y);

  drawArrow(pivot, tipA, "#4dabf7");
  drawArrow(pivot, tipB, "#cc5de8");
  drawHandle(tipA.x, tipA.y, "#4dabf7");
  drawHandle(tipB.x, tipB.y, "#cc5de8");
  drawHandle(pivot.x, pivot.y);

  const aNorm = a.clone().normalize();
  const aPerp = a.clone().normalize().perpendicular();
  drawArrow(
    pivot,
    { x: pivot.x + aNorm.x * 60, y: pivot.y + aNorm.y * 60 },
    "rgba(77,171,247,0.4)",
  );
  drawArrow(
    pivot,
    { x: pivot.x + aPerp.x * 60, y: pivot.y + aPerp.y * 60 },
    "#ffd43b",
  );

  const t = (Math.sin(performance.now() / 900) + 1) / 2;
  const lerped = Vec2.lerp(a, b, t);
  drawArrow(pivot, { x: pivot.x + lerped.x, y: pivot.y + lerped.y }, "#51cf66");

  ctx.fillStyle = "#fff";
  ctx.font = "13px monospace";
  const lines = [
    "przeciągnij niebieski/fioletowy grot = wektory A/B, żółty = perpendicular(A), zielony = Vec2.lerp(A,B,t) animowany",
    `|A|=${a.length().toFixed(1)} kąt=${AxiomMath.radToDeg(a.angle()).toFixed(0)}°   |B|=${b.length().toFixed(1)} kąt=${AxiomMath.radToDeg(b.angle()).toFixed(0)}°`,
    `dot(A,B)=${a.dot(b).toFixed(1)}   cross(A,B)=${a.cross(b).toFixed(1)}   distanceTo=${a.distanceTo(b).toFixed(1)}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 10, 20 + i * 16));

  // --- 3: reflect ---
  ctx.strokeStyle = "#868e96";
  ctx.beginPath();
  ctx.moveTo(mirrorA.x, mirrorA.y);
  ctx.lineTo(mirrorB.x, mirrorB.y);
  ctx.stroke();
  drawHandle(mirrorA.x, mirrorA.y, "#868e96");
  drawHandle(mirrorB.x, mirrorB.y, "#868e96");
  drawHandle(rayStart.x, rayStart.y, "#ff8787");

  const dirToMouse = Vec2.create(
    mouse.x - rayStart.x,
    mouse.y - rayStart.y,
  ).normalize();
  const farPoint = {
    x: rayStart.x + dirToMouse.x * 2000,
    y: rayStart.y + dirToMouse.y * 2000,
  };
  const hit = segmentIntersect(rayStart, farPoint, mirrorA, mirrorB);

  ctx.strokeStyle = "rgba(255,135,135,0.6)";
  ctx.beginPath();
  ctx.moveTo(rayStart.x, rayStart.y);
  ctx.lineTo(hit ? hit.point.x : farPoint.x, hit ? hit.point.y : farPoint.y);
  ctx.stroke();

  if (hit) {
    const mirrorDir = Vec2.create(
      mirrorB.x - mirrorA.x,
      mirrorB.y - mirrorA.y,
    ).normalize();
    const normal = mirrorDir.clone().perpendicular();
    const reflected = dirToMouse.clone().reflect(normal);
    const bounceEnd = {
      x: hit.point.x + reflected.x * 220,
      y: hit.point.y + reflected.y * 220,
    };

    drawHandle(hit.point.x, hit.point.y, "#ffd43b");
    ctx.strokeStyle = "#51cf66";
    ctx.beginPath();
    ctx.moveTo(hit.point.x, hit.point.y);
    ctx.lineTo(bounceEnd.x, bounceEnd.y);
    ctx.stroke();
    ctx.strokeStyle = "#ffd43b";
    ctx.beginPath();
    ctx.moveTo(hit.point.x, hit.point.y);
    ctx.lineTo(hit.point.x + normal.x * 40, hit.point.y + normal.y * 40);
    ctx.stroke();
  }

  ctx.fillStyle = "#fff";
  ctx.fillText(
    "czerwony uchwyt = start promienia (celuje w mysz), szare = lustro (przeciągalne) - reflect() przez normal z perpendicular()",
    10,
    72,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
