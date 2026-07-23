import AABB from "@/core/axiom/AABB";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
window.addEventListener("resize", resize);
resize();

let boxA: Box = { x: 150, y: 150, w: 220, h: 160 };
let boxB: Box = { x: 420, y: 260, w: 160, h: 120 };
let circle: Circle = { x: 600, y: 450, r: 60 };

let mousePos: Position2D = { x: 0, y: 0 };
let drag:
  | "boxA-move"
  | "boxA-resize"
  | "boxB-move"
  | "boxB-resize"
  | "circle-move"
  | "circle-resize"
  | null = null;
let dragOffset = { x: 0, y: 0 };

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function nearHandle(p: Position2D, hx: number, hy: number) {
  return dist(p, { x: hx, y: hy }) <= 8;
}
function inBox(p: Position2D, box: Box) {
  return (
    p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
  );
}
function inCircle(p: Position2D, c: Circle) {
  return dist(p, c) <= c.r;
}

canvas.addEventListener("mousedown", (e) => {
  const p = { x: e.offsetX, y: e.offsetY };

  if (nearHandle(p, boxA.x + boxA.w, boxA.y + boxA.h)) {
    drag = "boxA-resize";
    return;
  }
  if (nearHandle(p, boxB.x + boxB.w, boxB.y + boxB.h)) {
    drag = "boxB-resize";
    return;
  }
  if (nearHandle(p, circle.x + circle.r, circle.y)) {
    drag = "circle-resize";
    return;
  }

  if (inBox(p, boxA)) {
    drag = "boxA-move";
    dragOffset = { x: p.x - boxA.x, y: p.y - boxA.y };
    return;
  }
  if (inBox(p, boxB)) {
    drag = "boxB-move";
    dragOffset = { x: p.x - boxB.x, y: p.y - boxB.y };
    return;
  }
  if (inCircle(p, circle)) {
    drag = "circle-move";
    dragOffset = { x: p.x - circle.x, y: p.y - circle.y };
  }
});

canvas.addEventListener("mousemove", (e) => {
  mousePos = { x: e.offsetX, y: e.offsetY };
  if (!drag) return;

  if (drag === "boxA-move") {
    boxA.x = mousePos.x - dragOffset.x;
    boxA.y = mousePos.y - dragOffset.y;
  }
  if (drag === "boxB-move") {
    boxB.x = mousePos.x - dragOffset.x;
    boxB.y = mousePos.y - dragOffset.y;
  }
  if (drag === "circle-move") {
    circle.x = mousePos.x - dragOffset.x;
    circle.y = mousePos.y - dragOffset.y;
  }
  if (drag === "boxA-resize") {
    boxA.w = Math.max(20, mousePos.x - boxA.x);
    boxA.h = Math.max(20, mousePos.y - boxA.y);
  }
  if (drag === "boxB-resize") {
    boxB.w = Math.max(20, mousePos.x - boxB.x);
    boxB.h = Math.max(20, mousePos.y - boxB.y);
  }
  if (drag === "circle-resize") {
    circle.r = Math.max(8, dist(mousePos, circle));
  }
});

window.addEventListener("mouseup", () => {
  drag = null;
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

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const overlapsAB = AABB.overlaps(boxA, boxB);
  const containsAB = AABB.contains(boxA, boxB);
  const containsPointA = AABB.containsPoint(boxA, mousePos);
  const closest = AABB.closestPoint(boxA, mousePos);
  const intersectsCircleA = AABB.intersectsCircle(boxA, circle);
  const containsCircleA = AABB.containsCircle(boxA, circle);
  const centerA = AABB.getCenter(boxA);
  const centerB = AABB.getCenter(boxB);
  const intersection = AABB.getIntersection(boxA, boxB);

  ctx.fillStyle = containsPointA
    ? "rgba(77,171,247,0.35)"
    : "rgba(77,171,247,0.15)";
  ctx.fillRect(boxA.x, boxA.y, boxA.w, boxA.h);
  ctx.strokeStyle = "#4dabf7";
  ctx.strokeRect(boxA.x, boxA.y, boxA.w, boxA.h);
  drawHandle(boxA.x + boxA.w, boxA.y + boxA.h);

  ctx.fillStyle = overlapsAB
    ? "rgba(204,93,232,0.35)"
    : "rgba(204,93,232,0.15)";
  ctx.fillRect(boxB.x, boxB.y, boxB.w, boxB.h);
  ctx.strokeStyle = "#cc5de8";
  ctx.strokeRect(boxB.x, boxB.y, boxB.w, boxB.h);
  drawHandle(boxB.x + boxB.w, boxB.y + boxB.h);

  if (intersection) {
    const w = intersection.max.x - intersection.min.x;
    const h = intersection.max.y - intersection.min.y;
    ctx.fillStyle = "rgba(250,176,5,0.5)";
    ctx.fillRect(intersection.min.x, intersection.min.y, w, h);
  }

  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
  ctx.fillStyle = containsCircleA
    ? "rgba(81,207,102,0.4)"
    : intersectsCircleA
      ? "rgba(255,212,59,0.4)"
      : "rgba(255,255,255,0.1)";
  ctx.fill();
  ctx.strokeStyle = "#51cf66";
  ctx.stroke();
  drawHandle(circle.x + circle.r, circle.y);

  drawDot(centerA.x, centerA.y, "#4dabf7");
  drawDot(centerB.x, centerB.y, "#cc5de8");

  ctx.strokeStyle = "#fff";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(mousePos.x, mousePos.y);
  ctx.lineTo(closest.x, closest.y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawDot(closest.x, closest.y, "#fff");
  drawDot(mousePos.x, mousePos.y, containsPointA ? "#51cf66" : "#ff6b6b");

  ctx.fillStyle = "#fff";
  ctx.font = "13px monospace";
  const lines = [
    `overlaps(A,B): ${overlapsAB}`,
    `contains(A,B) [A zawiera B]: ${containsAB}`,
    `containsPoint(A, mysz): ${containsPointA}`,
    `closestPoint(A, mysz): (${closest.x.toFixed(0)}, ${closest.y.toFixed(0)})`,
    `intersectsCircle(A, C): ${intersectsCircleA}`,
    `containsCircle(A, C): ${containsCircleA}`,
    `getCenter(A): (${centerA.x.toFixed(0)}, ${centerA.y.toFixed(0)})`,
    `getIntersection(A,B): ${intersection ? "jest" : "brak"}`,
  ];
  lines.forEach((l, i) => ctx.fillText(l, 10, 20 + i * 16));
  ctx.fillText(
    "Przeciągnij środek = przesuń, przeciągnij biały uchwyt = zmień rozmiar",
    10,
    canvas.height - 10,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
