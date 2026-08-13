import SpatialGrid from "@/core/axiom/SpatialGrid";
import FrameSpatialGrid from "@/core/axiom/spatialGridFrame";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

type Body = { id: Symbol; x: number; y: number; r: number };
let nextId = 1;
let bodies: Body[] = [];

let mode: "persistent" | "frame" = "persistent";
let brushRadius = 16;
let cellSize: Size2D = { width: 64, height: 64 };

function aabbOf(b: Body): Box {
  return { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
}

let persistentGrid = new SpatialGrid<Body>(cellSize);
let frameGrid = new FrameSpatialGrid<Body>(cellSize);

function rebuildPersistentGrid() {
  persistentGrid = new SpatialGrid<Body>(cellSize);
  for (const b of bodies)
    persistentGrid.insert({ id: b.id, bounds: aabbOf(b), data: b });
}
function rebuildFrameGrid() {
  frameGrid = new FrameSpatialGrid<Body>(cellSize);
  for (const b of bodies)
    frameGrid.insert({ id: b.id, bounds: aabbOf(b), data: b });
}
function activeGrid() {
  return mode === "persistent" ? persistentGrid : frameGrid;
}

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
window.addEventListener("resize", resize);
resize();

function cellRangeOf(shape: Box): {
  minCellX: number;
  minCellY: number;
  maxCellX: number;
  maxCellY: number;
} {
  return {
    minCellX: Math.floor(shape.x / cellSize.width),
    minCellY: Math.floor(shape.y / cellSize.height),
    maxCellX: Math.floor((shape.x + shape.w) / cellSize.width),
    maxCellY: Math.floor((shape.y + shape.h) / cellSize.height),
  };
}

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
      if (mode === "persistent") persistentGrid.remove(hit.id);
    }
    return;
  }

  if (hit) {
    draggingId = hit.id;
    dragOffset = { x: x - hit.x, y: y - hit.y };
    return;
  }

  const body: Body = { id: Symbol(), x, y, r: brushRadius };
  bodies.push(body);
  if (mode === "persistent")
    persistentGrid.insert({ id: body.id, bounds: aabbOf(body), data: body });
});

canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;

  if (draggingId === null) return;
  const body = bodies.find((b) => b.id === draggingId);
  if (!body) return;
  body.x = mouse.x - dragOffset.x;
  body.y = mouse.y - dragOffset.y;
  if (mode === "persistent") persistentGrid.move(body.id, aabbOf(body));
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
    if (mode === "persistent") rebuildPersistentGrid();
  }
  if (e.key === "[") {
    cellSize = {
      width: Math.max(8, cellSize.width - 8),
      height: Math.max(8, cellSize.height - 8),
    };
    rebuildPersistentGrid();
  }
  if (e.key === "]") {
    cellSize = { width: cellSize.width + 8, height: cellSize.height + 8 };
    rebuildPersistentGrid();
  }
});

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (mode === "frame") rebuildFrameGrid();

  // linie siatki
  ctx.strokeStyle = "#282828";
  for (let x = 0; x < canvas.width; x += cellSize.width) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += cellSize.height) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // podświetl komórki zajęte przez ciała (żółte tło) — pokazuje że duże ciało trafia do wielu komórek
  ctx.fillStyle = "rgba(250, 176, 5, 0.12)";
  activeGrid().forEachCell((cx, cy, count) => {
    if (count > 0) {
      ctx.fillRect(
        cx * cellSize.width,
        cy * cellSize.height,
        cellSize.width,
        cellSize.height,
      );
    }
  });

  // sonda query() wokół kursora
  const probe: Box = {
    x: mouse.x - brushRadius,
    y: mouse.y - brushRadius,
    w: brushRadius * 2,
    h: brushRadius * 2,
  };
  const hitIds = new Set(
    activeGrid()
      .query(probe)
      .map((b) => b.id),
  );

  const probeRange = cellRangeOf(probe);
  ctx.strokeStyle = "#f59f00";
  ctx.lineWidth = 2;
  for (let cx = probeRange.minCellX; cx <= probeRange.maxCellX; cx++) {
    for (let cy = probeRange.minCellY; cy <= probeRange.maxCellY; cy++) {
      ctx.strokeRect(
        cx * cellSize.width,
        cy * cellSize.height,
        cellSize.width,
        cellSize.height,
      );
    }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(245,159,0,0.6)";
  ctx.strokeRect(probe.x, probe.y, probe.w, probe.h);

  // ciała
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

  ctx.fillStyle = "#fff";
  ctx.font = "14px monospace";
  ctx.fillText(
    `tryb: ${mode.toUpperCase()} (Tab)   cellSize: ${cellSize.width} ([ / ])   ciał: ${bodies.length}   promień: ${brushRadius.toFixed(0)} (scroll)`,
    10,
    20,
  );
  ctx.fillText(
    "LPM puste=dodaj, LPM+drag=przesuń, PPM=usuń. Zielone = trafione przez query() wokół kursora.",
    10,
    40,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
