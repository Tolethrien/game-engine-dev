import Easing from "@/core/axiom/easing";
import AxiomMath from "@/core/axiom/math";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
window.addEventListener("resize", resize);
resize();

const fns: { name: string; fn: (t: number) => number }[] = [
  { name: "linear", fn: Easing.linear },
  { name: "easeInQuad", fn: Easing.easeInQuad },
  { name: "easeOutQuad", fn: Easing.easeOutQuad },
  { name: "easeInOutQuad", fn: Easing.easeInOutQuad },
  { name: "easeInCubic", fn: Easing.easeInCubic },
  { name: "easeOutCubic", fn: Easing.easeOutCubic },
  { name: "easeInOutCubic", fn: Easing.easeInOutCubic },
  { name: "easeInSine", fn: Easing.easeInSine },
  { name: "easeOutSine", fn: Easing.easeOutSine },
  { name: "easeInOutSine", fn: Easing.easeInOutSine },
];

const COLS = 5;
const PAD = 20;
const CELL_W = 220;
const CELL_H = 220;
const GRAPH_H = 120;
const TRACK_Y_OFFSET = 140;
const TRACK_W = 180;

const DURATION = 1600;
let startTime = performance.now();

let scrubbing = false;
let manualT: number | null = null;

const scrubBar = { x: 0, y: 0, w: 0, h: 20 };

function layoutScrubBar() {
  const rows = Math.ceil(fns.length / COLS);
  scrubBar.x = PAD;
  scrubBar.y = PAD + 20 + rows * CELL_H + 20;
  scrubBar.w = COLS * CELL_W;
}

function drawGraph(
  x: number,
  y: number,
  name: string,
  fn: (t: number) => number,
  t: number,
) {
  ctx.strokeStyle = "#444";
  ctx.strokeRect(x, y, CELL_W - 20, GRAPH_H);

  ctx.beginPath();
  ctx.strokeStyle = "#0af";
  for (let i = 0; i <= 50; i++) {
    const tt = i / 50;
    const v = fn(tt);
    const px = x + tt * (CELL_W - 20);
    const py = y + GRAPH_H - v * GRAPH_H;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  const v = fn(t);
  const px = x + t * (CELL_W - 20);
  const py = y + GRAPH_H - v * GRAPH_H;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(px, py, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(name, x, y - 6);

  const trackY = y + TRACK_Y_OFFSET;
  ctx.strokeStyle = "#333";
  ctx.beginPath();
  ctx.moveTo(x, trackY);
  ctx.lineTo(x + TRACK_W, trackY);
  ctx.stroke();

  const dotX = x + AxiomMath.lerp(0, TRACK_W, v);
  ctx.fillStyle = "#fa0";
  ctx.beginPath();
  ctx.arc(dotX, trackY, 6, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  layoutScrubBar();

  const autoT = ((performance.now() - startTime) % DURATION) / DURATION;
  const t = manualT ?? autoT;

  ctx.fillStyle = "#fff";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "Easing curves — auto-animacja, przeciągnij pasek na dole żeby scrubować ręcznie (dwuklik = wróć do auto)",
    PAD,
    PAD - 4,
  );

  fns.forEach((f, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * CELL_W;
    const y = PAD + 20 + row * CELL_H;
    drawGraph(x, y, f.name, f.fn, t);
  });

  ctx.strokeStyle = "#666";
  ctx.strokeRect(scrubBar.x, scrubBar.y, scrubBar.w, scrubBar.h);
  const handleX = scrubBar.x + t * scrubBar.w;
  ctx.fillStyle = manualT !== null ? "#fa0" : "#0af";
  ctx.fillRect(handleX - 3, scrubBar.y - 4, 6, scrubBar.h + 8);
  ctx.fillStyle = "#fff";
  ctx.font = "11px monospace";
  ctx.fillText(
    `t=${t.toFixed(2)} ${manualT !== null ? "(manual)" : "(auto)"}`,
    scrubBar.x,
    scrubBar.y + scrubBar.h + 14,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function inScrubBar(x: number, y: number) {
  return (
    x >= scrubBar.x &&
    x <= scrubBar.x + scrubBar.w &&
    y >= scrubBar.y - 6 &&
    y <= scrubBar.y + scrubBar.h + 6
  );
}

canvas.addEventListener("mousedown", (e) => {
  if (inScrubBar(e.offsetX, e.offsetY)) {
    scrubbing = true;
    manualT = Math.max(0, Math.min(1, (e.offsetX - scrubBar.x) / scrubBar.w));
  }
});
canvas.addEventListener("mousemove", (e) => {
  if (scrubbing) {
    manualT = Math.max(0, Math.min(1, (e.offsetX - scrubBar.x) / scrubBar.w));
  }
});
window.addEventListener("mouseup", () => {
  scrubbing = false;
});
canvas.addEventListener("dblclick", (e) => {
  if (!inScrubBar(e.offsetX, e.offsetY)) {
    manualT = null;
    startTime = performance.now();
  }
});
