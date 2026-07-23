import Mat4 from "@/core/axiom/mat4";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
window.addEventListener("resize", resize);
resize();

const cubeVerts: [number, number, number, number][] = [
  [-1, -1, -1, 1],
  [1, -1, -1, 1],
  [1, 1, -1, 1],
  [-1, 1, -1, 1],
  [-1, -1, 1, 1],
  [1, -1, 1, 1],
  [1, 1, 1, 1],
  [-1, 1, 1, 1],
];
const edges: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

let orbitYaw = 0.6;
let orbitPitch = 0.4;
let dist = 6;
let projMode: "perspective" | "ortho" = "perspective";
let dragging = false;
let lastMouse = { x: 0, y: 0 };

canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  lastMouse = { x: e.offsetX, y: e.offsetY };
});
canvas.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  orbitYaw += (e.offsetX - lastMouse.x) * 0.01;
  orbitPitch = Math.max(
    -1.4,
    Math.min(1.4, orbitPitch + (e.offsetY - lastMouse.y) * 0.01),
  );
  lastMouse = { x: e.offsetX, y: e.offsetY };
});
window.addEventListener("mouseup", () => {
  dragging = false;
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  dist = Math.max(2, Math.min(20, dist + e.deltaY * 0.01));
});
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "o")
    projMode = projMode === "perspective" ? "ortho" : "perspective";
});

function project(
  v: [number, number, number, number],
  mvp: Mat4,
): Position2D | null {
  const [cx, cy, cz, cw] = mvp.transform(v);
  if (cw <= 0.001) return null;
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  return {
    x: (ndcX * 0.5 + 0.5) * canvas.width,
    y: (1 - (ndcY * 0.5 + 0.5)) * canvas.height,
  };
}
function printMat(label: string, m: Mat4, x: number, y: number) {
  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(label, x, y);
  const e = m.elements;
  for (let row = 0; row < 4; row++) {
    const line = [0, 1, 2, 3]
      .map((col) => e[col * 4 + row].toFixed(2).padStart(7))
      .join(" ");
    ctx.fillText(line, x, y + 16 + row * 14);
  }
}

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const t = performance.now() / 1000;

  const eye: [number, number, number] = [
    Math.cos(orbitYaw) * Math.cos(orbitPitch) * dist,
    Math.sin(orbitPitch) * dist,
    Math.sin(orbitYaw) * Math.cos(orbitPitch) * dist,
  ];
  const view = Mat4.lookAt(eye, [0, 0, 0], [0, 1, 0]);

  const aspect = canvas.width / canvas.height;
  const proj =
    projMode === "perspective"
      ? Mat4.perspective((60 * Math.PI) / 180, aspect, 0.1, 100)
      : Mat4.ortho(-3 * aspect, 3 * aspect, -3, 3, 0.1, 100);

  const model = Mat4.identity
    .rotateX(t * 0.6)
    .rotateY(t * 0.9)
    .rotateZ(t * 0.2)
    .scale(1);

  const mvp = proj.multiply(view).multiply(model);

  const screenPts = cubeVerts.map((v) => project(v, mvp));

  ctx.strokeStyle = "#4dabf7";
  ctx.lineWidth = 2;
  for (const [i, j] of edges) {
    const p1 = screenPts[i];
    const p2 = screenPts[j];
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = "#ffd43b";
  for (const p of screenPts) {
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // panel diagnostyczny: invert()
  const sample = Mat4.identity.translate([1, 2, 3]).rotateY(0.7);
  const inverted = sample.clone().invert();
  const roundTrip = sample.clone().multiply(inverted);
  const identity = Mat4.identity;

  const isCloseToIdentity = Array.from(roundTrip.elements).every(
    (v, i) => Math.abs(v - identity.elements[i]) < 0.01,
  );

  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(
    `tryb projekcji: ${projMode.toUpperCase()} (O = przełącz)   drag = orbit kamery, scroll = zoom (dist=${dist.toFixed(1)})`,
    10,
    20,
  );

  printMat(
    "sample = Mat4.identity.translate([1,2,3]).rotateY(0.7):",
    sample,
    10,
    44,
  );
  printMat("sample.invert():", inverted, 10, 128);
  printMat("sample * sample.invert()  <- to policzone:", roundTrip, 10, 212);
  printMat("Mat4.identity  <- to POWINNO wyjść wyżej:", identity, 320, 212);

  ctx.fillStyle = isCloseToIdentity ? "#51cf66" : "#ff6b6b";
  ctx.font = "14px monospace";
  ctx.fillText(
    isCloseToIdentity
      ? "invert() DZIAŁA POPRAWNIE (sample * invert(sample) ≈ identity)"
      : "invert() NIE DZIAŁA (sample * invert(sample) != identity)",
    10,
    300,
  );

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
