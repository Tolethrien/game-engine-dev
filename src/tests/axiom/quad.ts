import QuadTree from "@/core/axiom/quadTree";
import FrameQuadTree from "@/core/axiom/quadTreeFrame";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

type Body = { id: number; x: number; y: number; r: number };
let nextId = 1;
let bodies: Body[] = [];

let mode: "persistent" | "frame" = "persistent";
let brushRadius = 16;

function worldBounds(): BoxAABB {
  return { min: { x: 0, y: 0 }, max: { x: canvas.width, y: canvas.height } };
}
function aabbOf(b: Body): Box {
  return { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
}
function boxOverlapsAABB(box: Box, aabb: BoxAABB) {
  return (
    box.x <= aabb.max.x &&
    box.x + box.w >= aabb.min.x &&
    box.y <= aabb.max.y &&
    box.y + box.h >= aabb.min.y
  );
}

let persistentTree = new QuadTree<Body>(worldBounds());
let frameTree = new FrameQuadTree<Body>(worldBounds());

function rebuildPersistentTree() {
  persistentTree = new QuadTree<Body>(worldBounds());
  for (const b of bodies)
    persistentTree.insert({ id: b.id, bounds: aabbOf(b), data: b });
}
function rebuildFrameTree() {
  frameTree = new FrameQuadTree<Body>(worldBounds());
  for (const b of bodies) frameTree.insert({ bounds: aabbOf(b), data: b });
}
function activeTree() {
  return mode === "persistent" ? persistentTree : frameTree;
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (mode === "persistent") rebuildPersistentTree();
}
window.addEventListener("resize", resize);
resize();

let draggingId: number | null = null;
let dragOffset = { x: 0, y: 0 };
const mouse = { x: 0, y: 0 };

function bodyAt(x: number, y: number): Body | null {
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i];
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r) return b;
  }
  return null;
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("mousedown", (e) => {
  const x = e.offsetX;
  const y = e.offsetY;
  const hit = bodyAt(x, y);

  if (e.button === 2) {
    if (hit) {
      bodies = bodies.filter((b) => b.id !== hit.id);
      if (mode === "persistent") persistentTree.remove(hit.id);
    }
    return;
  }

  if (hit) {
    draggingId = hit.id;
    dragOffset = { x: x - hit.x, y: y - hit.y };
    return;
  }

  const body: Body = { id: nextId++, x, y, r: brushRadius };
  bodies.push(body);
  if (mode === "persistent")
    persistentTree.insert({ id: body.id, bounds: aabbOf(body), data: body });
});

canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;

  if (draggingId === null) return;
  const body = bodies.find((b) => b.id === draggingId);
  if (!body) return;
  body.x = mouse.x - dragOffset.x;
  body.y = mouse.y - dragOffset.y;
  if (mode === "persistent") persistentTree.move(body.id, aabbOf(body));
});

window.addEventListener("mouseup", () => {
  draggingId = null;
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  brushRadius = Math.max(4, Math.min(80, brushRadius - e.deltaY * 0.05));
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    mode = mode === "persistent" ? "frame" : "persistent";
    if (mode === "persistent") rebuildPersistentTree();
  }
});

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (mode === "frame") rebuildFrameTree();

  const probe: Box = {
    x: mouse.x - brushRadius,
    y: mouse.y - brushRadius,
    w: brushRadius * 2,
    h: brushRadius * 2,
  };
  const hitIds = new Set(
    activeTree()
      .query(probe)
      .map((b) => b.id),
  );

  activeTree().forEachNode((bounds, depth, count) => {
    const touchedByProbe = boxOverlapsAABB(probe, bounds);
    ctx.strokeStyle = touchedByProbe
      ? "#f59f00"
      : count > 0
        ? `hsl(${200 - depth * 20}, 80%, 55%)`
        : "#333";
    ctx.lineWidth = touchedByProbe
      ? Math.max(2, 4 - depth * 0.4)
      : Math.max(1, 3 - depth * 0.4);
    ctx.strokeRect(
      bounds.min.x,
      bounds.min.y,
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
    );
  });
  ctx.lineWidth = 1;

  for (const b of bodies) {
    const isHit = hitIds.has(b.id);
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle =
      b.id === draggingId ? "#f59f00" : isHit ? "#51cf66" : "#4dabf7";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(mouse.x, mouse.y, brushRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(245,159,0,0.6)";
  ctx.strokeRect(probe.x, probe.y, probe.w, probe.h);

  ctx.fillStyle = "#fff";
  ctx.font = "14px monospace";
  ctx.fillText(
    `tryb: ${mode.toUpperCase()} (Tab = przełącz)   ciał: ${bodies.length}   promień pędzla: ${brushRadius.toFixed(0)} (scroll)`,
    10,
    20,
  );
  ctx.fillText(
    "LPM na pustym = dodaj, LPM+drag na ciele = przesuń, PPM na ciele = usuń. Zielone = trafione przez query() wokół kursora, pomarańczowy prostokąt = zasięg query(), pomarańczowe węzły = te, które query() odwiedził.",
    10,
    40,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
