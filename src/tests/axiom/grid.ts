import Grid from "@/core/axiom/grid";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

const tileSize: Size2D = { width: 48, height: 48 };
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

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
  gridSize = {
    width: Math.ceil(canvas.width / tileSize.width) - 1,
    height: Math.ceil(canvas.height / tileSize.height) - 2,
  };
  tiles = Grid.generateGrid({
    gridSize,
    tileSize,
    callback: ({ tilePixelPos, tileGridPos, index }) => ({
      tilePixelPos,
      tileGridPos,
      index,
    }),
  });
  painted.clear();
}
window.addEventListener("resize", resize);
resize();

function applyPaint(index: number) {
  if (paintMode === "add") painted.add(index);
  else if (paintMode === "remove") painted.delete(index);
}

canvas.addEventListener("mousemove", (e) => {
  mouseWorld = { x: e.offsetX, y: e.offsetY };
  const tile = Grid.worldToTile(mouseWorld, tileSize);
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

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = "10px monospace";
  tiles.forEach(({ tilePixelPos, tileGridPos, index }) => {
    const isPainted = painted.has(index);
    const isHovered = index === hoveredIndex;

    ctx.fillStyle = isPainted ? "#2b8a3e" : isHovered ? "#334155" : "#1a1a1a";
    ctx.fillRect(
      tilePixelPos.x,
      tilePixelPos.y,
      tileSize.width,
      tileSize.height,
    );
    ctx.strokeStyle = "#333";
    ctx.strokeRect(
      tilePixelPos.x,
      tilePixelPos.y,
      tileSize.width,
      tileSize.height,
    );

    if (isHovered) {
      ctx.fillStyle = "#fff";
      ctx.fillText(`${index}`, tilePixelPos.x + 4, tilePixelPos.y + 14);
      ctx.fillText(
        `${tileGridPos.x},${tileGridPos.y}`,
        tilePixelPos.x + 4,
        tilePixelPos.y + 26,
      );
    }
  });

  if (hoveredIndex !== null) {
    const hoveredTile = Grid.indexToTile(hoveredIndex, gridSize.width);
    const center = Grid.tileCenterToWorld(hoveredTile, tileSize);
    ctx.fillStyle = "#f59f00";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.fill();

    const snapped = Grid.snapToGrid(mouseWorld, tileSize);
    const snappedCenter = Grid.snapToGridCenter(mouseWorld, tileSize);
    ctx.strokeStyle = "#f59f00";
    ctx.strokeRect(snapped.x, snapped.y, tileSize.width, tileSize.height);

    const backTile = Grid.worldToTile(mouseWorld, tileSize);
    const roundTripOk =
      hoveredTile.x === backTile.x && hoveredTile.y === backTile.y;

    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.fillText(
      `hover tile (${hoveredTile.x}, ${hoveredTile.y})  index=${hoveredIndex}  indexToTile round-trip: ${roundTripOk ? "OK" : "FAIL"}`,
      10,
      canvas.height - 40,
    );
    ctx.fillText(
      `mouse world (${mouseWorld.x.toFixed(0)}, ${mouseWorld.y.toFixed(0)})  snapToGrid (${snapped.x}, ${snapped.y})  snapToGridCenter (${snappedCenter.x.toFixed(0)}, ${snappedCenter.y.toFixed(0)})`,
      10,
      canvas.height - 20,
    );
  }

  ctx.fillStyle = "#aaa";
  ctx.font = "12px monospace";
  ctx.fillText(
    `tiles: ${tiles.length}  painted: ${painted.size}  (klik/przeciągnij = maluj, klik na pomalowanym = usuń)`,
    10,
    16,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
