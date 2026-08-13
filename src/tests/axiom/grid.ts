import Grid from "@/core/axiom/grid";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const orthoTileSize: Size2D = { width: 48, height: 48 };
const isoTileSize: Size2D = { width: 32, height: 32 };

let mode: "ortho" | "iso" = "ortho";
let gridSize: Size2D = { width: 0, height: 0 };
let tiles: {
  tilePixelPos: Position2D;
  tileGridPos: Position2D;
  index: number;
}[] = [];

const painted = new Set<number>();
let hoveredIndex: number | null = null;
let mouseWorld: Position2D = { x: 0, y: 0 };
let paintMode: "add" | "remove" | null = null;

function tileSize(): Size2D {
  return mode === "ortho" ? orthoTileSize : isoTileSize;
}
function origin(): Position2D {
  return mode === "ortho"
    ? { x: orthoTileSize.width, y: orthoTileSize.width }
    : { x: canvas.width / 2, y: 160 };
}

function worldToTile(p: Position2D): Position2D {
  const o = origin();
  const local = { x: p.x - o.x, y: p.y - o.y };
  return mode === "ortho"
    ? Grid.worldToTile(local, tileSize())
    : Grid.isoWorldToTile(local, tileSize());
}

function tileCenterToWorld(t: Position2D): Position2D {
  const local =
    mode === "ortho"
      ? Grid.tileCenterToWorld(t, tileSize())
      : Grid.isoTileCenterToWorld(t, tileSize());
  const o = origin();
  return { x: local.x + o.x, y: local.y + o.y };
}
function snapToGrid(p: Position2D): Position2D {
  const o = origin();
  const local = { x: p.x - o.x, y: p.y - o.y };
  const snapped =
    mode === "ortho"
      ? Grid.snapToGrid(local, tileSize())
      : Grid.isoSnapToGrid(local, tileSize());
  return { x: snapped.x + o.x, y: snapped.y + o.y };
}
function snapToGridCenter(p: Position2D): Position2D {
  const o = origin();
  const local = { x: p.x - o.x, y: p.y - o.y };
  const snapped =
    mode === "ortho"
      ? Grid.snapToGridCenter(local, tileSize())
      : Grid.isoSnapToGridCenter(local, tileSize());
  return { x: snapped.x + o.x, y: snapped.y + o.y };
}

function rebuildTiles() {
  if (mode === "ortho") {
    gridSize = {
      width: Math.ceil(
        (canvas.width - orthoTileSize.width * 3) / orthoTileSize.width,
      ),
      height: Math.ceil(
        (canvas.height - orthoTileSize.height * 3) / orthoTileSize.height,
      ),
    };
    tiles = Grid.generateGrid({
      gridSize,
      tileSize: orthoTileSize,
      callback: ({ tilePixelPos, tileGridPos, index }) => ({
        tilePixelPos,
        tileGridPos,
        index,
      }),
    });
  } else {
    gridSize = { width: 20, height: 24 };
    tiles = Grid.generateIsoGrid({
      gridSize,
      tileSize: isoTileSize,
      callback: ({ tilePixelPos, tileGridPos, index }) => ({
        tilePixelPos,
        tileGridPos,
        index,
      }),
    });
  }
  painted.clear();
}

function resize() {
  canvas.width = window.innerWidth - 20;
  canvas.height = window.innerHeight - 60;
  rebuildTiles();
}
window.addEventListener("resize", resize);
resize();

function applyPaint(index: number) {
  if (paintMode === "add") painted.add(index);
  else if (paintMode === "remove") painted.delete(index);
}

canvas.addEventListener("mousemove", (e) => {
  mouseWorld = { x: e.offsetX, y: e.offsetY };
  const tile = worldToTile(mouseWorld);
  hoveredIndex =
    tile.x >= 0 &&
    tile.x < gridSize.width &&
    tile.y >= 0 &&
    tile.y < gridSize.height
      ? Grid.tileToIndex(tile, gridSize.width)
      : null;

  if (paintMode && hoveredIndex !== null) applyPaint(hoveredIndex);
});

canvas.addEventListener("mousedown", () => {
  if (hoveredIndex === null) return;
  paintMode = painted.has(hoveredIndex) ? "remove" : "add";
  applyPaint(hoveredIndex);
});
window.addEventListener("mouseup", () => {
  paintMode = null;
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    mode = mode === "ortho" ? "iso" : "ortho";
    rebuildTiles();
  }
});

function drawOrthoTile(pos: Position2D, size: Size2D, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(pos.x, pos.y, size.width, size.height);
  ctx.strokeStyle = "#333";
  ctx.strokeRect(pos.x, pos.y, size.width, size.height);
}
function drawIsoTile(pos: Position2D, size: Size2D, fill: string) {
  const halfW = size.width / 2;
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(pos.x + halfW, pos.y + size.height / 2);
  ctx.lineTo(pos.x, pos.y + size.height);
  ctx.lineTo(pos.x - halfW, pos.y + size.height / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "#333";
  ctx.stroke();
}

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const o = origin();
  const ts = tileSize();

  ctx.font = "10px monospace";
  tiles.forEach(({ tilePixelPos, tileGridPos, index }) => {
    const pos = { x: tilePixelPos.x + o.x, y: tilePixelPos.y + o.y };
    const isPainted = painted.has(index);
    const isHovered = index === hoveredIndex;
    const fill = isPainted ? "#2b8a3e" : isHovered ? "#334155" : "#1a1a1a";

    if (mode === "ortho") drawOrthoTile(pos, ts, fill);
    else drawIsoTile(pos, ts, fill);

    if (isHovered) {
      ctx.fillStyle = "#fff";
      const labelY = mode === "ortho" ? pos.y + 14 : pos.y + ts.height / 2 - 4;
      const labelX = mode === "ortho" ? pos.x + 4 : pos.x - 14;
      ctx.fillText(`${index}`, labelX, labelY);
      ctx.fillText(`${tileGridPos.x},${tileGridPos.y}`, labelX, labelY + 12);
    }
  });

  if (hoveredIndex !== null) {
    const hoveredTile = Grid.indexToTile(hoveredIndex, gridSize.width);
    const center = tileCenterToWorld(hoveredTile);
    ctx.fillStyle = "#f59f00";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.fill();

    const snapped = snapToGrid(mouseWorld);
    const snappedCenter = snapToGridCenter(mouseWorld);
    ctx.strokeStyle = "#f59f00";
    if (mode === "ortho")
      ctx.strokeRect(snapped.x, snapped.y, ts.width, ts.height);
    else
      (drawIsoTile(snapped, ts, "rgba(0,0,0,0)"),
        (ctx.strokeStyle = "#f59f00"));

    const backTile = worldToTile(mouseWorld);
    const roundTripOk =
      hoveredTile.x === backTile.x && hoveredTile.y === backTile.y;

    ctx.fillStyle = "#fff";
    ctx.font = "13px monospace";
    ctx.fillText(
      `hover tile (${hoveredTile.x}, ${hoveredTile.y})  index=${hoveredIndex}  indexToTile round-trip: ${roundTripOk ? "OK" : "FAIL"}`,
      10,
      40,
    );
    ctx.fillText(
      `mouse world (${mouseWorld.x.toFixed(0)}, ${mouseWorld.y.toFixed(0)})  snap (${snapped.x.toFixed(0)}, ${snapped.y.toFixed(0)})  snapCenter (${snappedCenter.x.toFixed(0)}, ${snappedCenter.y.toFixed(0)})`,
      10,
      56,
    );
  }

  ctx.fillStyle = "#fff";
  ctx.font = "14px monospace";
  ctx.fillText(
    `tryb: ${mode.toUpperCase()} (Tab = przełącz ortho/iso)   tiles: ${tiles.length}   painted: ${painted.size}`,
    10,
    20,
  );
  ctx.fillStyle = "#aaa";
  ctx.font = "12px monospace";
  ctx.fillText("klik/przeciągnij = maluj, klik na pomalowanym = usuń", 10, 76);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
