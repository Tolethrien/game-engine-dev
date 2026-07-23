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
canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;
});

type Quad = { x: number; y: number; w: number; h: number };
function layout(): { A: Quad; B: Quad; C: Quad; D: Quad } {
  const margin = 0;
  const colW = (canvas.width - margin * 3) / 2;
  const rowH = (canvas.height - margin * 3) / 2;
  return {
    A: { x: margin, y: margin, w: colW, h: rowH },
    B: { x: margin * 2 + colW, y: margin, w: colW, h: rowH },
    C: { x: margin, y: margin * 2 + rowH, w: colW, h: rowH },
    D: { x: margin * 2 + colW, y: margin * 2 + rowH, w: colW, h: rowH },
  };
}
function inQuad(p: Position2D, q: Quad) {
  return p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h;
}
function withClip(q: Quad, fn: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(q.x, q.y, q.w, q.h);
  ctx.clip();
  fn();
  ctx.restore();
  ctx.strokeStyle = "#333";
  ctx.strokeRect(q.x, q.y, q.w, q.h);
}
function header(q: Quad, text: string) {
  ctx.fillStyle = "#fff";
  ctx.font = "13px monospace";
  ctx.fillText(text, q.x + 8, q.y + 18);
}
function drawArrow(from: Position2D, to: Position2D, color: string) {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

// --- A: randomInCirclePoint / randomInRectPoint ---
type Region =
  | { kind: "circle"; x: number; y: number; r: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number };
let region: Region | null = null;
let points: Position2D[] = [];

// --- B: lerpAngle ---
let currentAngle = 0;

// --- C: weightedRandom / randomBool / randomSign ---
const buckets = ["A", "B", "C", "D"];
const weights = [1, 2, 3, 6];
const counts = [0, 0, 0, 0];
let coinTrue = 0;
let coinFalse = 0;
let signPlus = 0;
let signMinus = 0;

// --- D: map / clamp / inverseLerp ---
const fromMin = 0;
const fromMax = 100;
const toMin = 20;
const toMax = 255;
let handleT = 0.5; // pozycja górnego suwaka jako ułamek 0..1
let draggingHandle = false;
let barValue = 130; // wartość docelowa 0-255, przeciągalna, może wyjść poza zakres (test clamp)
let draggingBar = false;

canvas.addEventListener("mousedown", (e) => {
  const p = { x: e.offsetX, y: e.offsetY };
  const q = layout();

  if (inQuad(p, q.A)) {
    const rel = { x: p.x - q.A.x, y: p.y - q.A.y };
    region =
      !region || region.kind === "circle"
        ? {
            kind: "rect",
            x: rel.x - q.A.w * 0.25,
            y: rel.y - q.A.h * 0.2,
            w: q.A.w * 0.5,
            h: q.A.h * 0.4,
          }
        : {
            kind: "circle",
            x: rel.x,
            y: rel.y,
            r: Math.min(q.A.w, q.A.h) * 0.28,
          };
    points = [];
  }

  if (inQuad(p, q.D)) {
    const trackX0 = q.D.x + 20;
    const trackX1 = q.D.x + q.D.w - 80;
    if (
      Math.abs(p.y - (q.D.y + q.D.h * 0.55)) < 14 &&
      p.x > trackX0 - 10 &&
      p.x < trackX1 + 10
    ) {
      draggingHandle = true;
      handleT = AxiomMath.clamp((p.x - trackX0) / (trackX1 - trackX0), 0, 1);
    }

    const barX = q.D.x + q.D.w - 44;
    const barY0 = q.D.y + 30;
    const barY1 = q.D.y + q.D.h - 40;
    if (
      p.x > barX - 12 &&
      p.x < barX + 34 &&
      p.y > barY0 - 50 &&
      p.y < barY1 + 50
    ) {
      draggingBar = true;
      barValue = AxiomMath.map(
        p.y,
        barY1 + 50,
        barY0 - 50,
        toMin - 70,
        toMax + 70,
      );
    }
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (draggingHandle) {
    const q = layout().D;
    const trackX0 = q.x + 20;
    const trackX1 = q.x + q.w - 80;
    handleT = AxiomMath.clamp(
      (e.offsetX - trackX0) / (trackX1 - trackX0),
      0,
      1,
    );
  }
  if (draggingBar) {
    const q = layout().D;
    const barY0 = q.y + 30;
    const barY1 = q.y + q.h - 40;
    barValue = AxiomMath.map(
      e.offsetY,
      barY1 + 50,
      barY0 - 50,
      toMin - 70,
      toMax + 70,
    );
  }
});
window.addEventListener("mouseup", () => {
  draggingHandle = false;
  draggingBar = false;
});

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const q = layout();

  // A -----------------------------------------------------------
  withClip(q.A, () => {
    header(
      q.A,
      "A) randomInCirclePoint / randomInRectPoint (klik = zmień region)",
    );
    if (!region)
      region = {
        kind: "circle",
        x: q.A.w * 0.5,
        y: q.A.h * 0.55,
        r: Math.min(q.A.w, q.A.h) * 0.28,
      };

    for (let i = 0; i < 8 && points.length < 3000; i++) {
      points.push(
        region.kind === "circle"
          ? AxiomMath.randomInCirclePoint(
              { x: q.A.x + region.x, y: q.A.y + region.y },
              region.r,
            )
          : AxiomMath.randomInRectPoint({
              x: q.A.x + region.x,
              y: q.A.y + region.y,
              w: region.w,
              h: region.h,
            }),
      );
    }

    ctx.strokeStyle = "#4dabf7";
    if (region.kind === "circle") {
      ctx.beginPath();
      ctx.arc(q.A.x + region.x, q.A.y + region.y, region.r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(q.A.x + region.x, q.A.y + region.y, region.w, region.h);
    }
    ctx.fillStyle = "rgba(255,212,59,0.5)";
    for (const p of points) ctx.fillRect(p.x, p.y, 1.5, 1.5);
  });

  // B -----------------------------------------------------------
  withClip(q.B, () => {
    header(q.B, "B) lerpAngle - wskazówka goni kąt do myszy najkrótszą drogą");
    const pivot = { x: q.B.x + q.B.w * 0.5, y: q.B.y + q.B.h * 0.55 };
    const radius = Math.min(q.B.w, q.B.h) * 0.32;

    const targetAngle = Math.atan2(mouse.y - pivot.y, mouse.x - pivot.x);
    currentAngle = AxiomMath.lerpAngle(currentAngle, targetAngle, 0.06);

    ctx.strokeStyle = "#333";
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    drawArrow(
      pivot,
      {
        x: pivot.x + Math.cos(targetAngle) * radius,
        y: pivot.y + Math.sin(targetAngle) * radius,
      },
      "rgba(255,255,255,0.3)",
    );
    drawArrow(
      pivot,
      {
        x: pivot.x + Math.cos(currentAngle) * radius,
        y: pivot.y + Math.sin(currentAngle) * radius,
      },
      "#51cf66",
    );

    ctx.fillStyle = "#fff";
    ctx.fillText(
      `target=${AxiomMath.radToDeg(targetAngle).toFixed(0)}°  current=${AxiomMath.radToDeg(currentAngle).toFixed(0)}°`,
      q.B.x + 8,
      q.B.y + q.B.h - 10,
    );
  });

  // C -----------------------------------------------------------
  withClip(q.C, () => {
    header(q.C, "C) weightedRandom [1,2,3,6] / randomBool / randomSign");

    const winner = AxiomMath.weightedRandom(buckets, weights);
    counts[buckets.indexOf(winner)]++;
    if (AxiomMath.randomBool(0.5)) coinTrue++;
    else coinFalse++;
    if (AxiomMath.randomSign() > 0) signPlus++;
    else signMinus++;

    const baseY = q.C.y + q.C.h - 40;
    const maxBarH = q.C.h * 0.4;
    const maxCount = Math.max(...counts, 1);
    const barW = 28;
    const gap = 16;
    const startX = q.C.x + 16;

    buckets.forEach((b, i) => {
      const h = AxiomMath.map(counts[i], 0, maxCount, 0, maxBarH, true);
      const x = startX + i * (barW + gap);
      ctx.fillStyle = "#cc5de8";
      ctx.fillRect(x, baseY - h, barW, h);
      ctx.fillStyle = "#fff";
      ctx.fillText(`${b}:${counts[i]}`, x - 4, baseY + 16);
    });

    ctx.fillStyle = "#fff";
    ctx.fillText(
      `randomBool: ${coinTrue}/${coinFalse}   randomSign: ${signPlus}/${signMinus}`,
      q.C.x + 8,
      q.C.y + q.C.h - 8,
    );
  });

  // D -----------------------------------------------------------
  withClip(q.D, () => {
    header(
      q.D,
      "D) map/clamp/inverseLerp - przeciągnij górny suwak i zielony pasek",
    );

    const trackY = q.D.y + q.D.h * 0.55;
    const trackX0 = q.D.x + 20;
    const trackX1 = q.D.x + q.D.w - 80;

    ctx.strokeStyle = "#555";
    ctx.beginPath();
    ctx.moveTo(trackX0, trackY);
    ctx.lineTo(trackX1, trackY);
    ctx.stroke();
    for (let i = 0; i <= 4; i++) {
      const val = fromMin + (i * (fromMax - fromMin)) / 4;
      const tx = AxiomMath.map(val, fromMin, fromMax, trackX0, trackX1);
      ctx.beginPath();
      ctx.moveTo(tx, trackY - 5);
      ctx.lineTo(tx, trackY + 5);
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.fillText(`${val}`, tx - 8, trackY + 18);
    }

    const handleX = AxiomMath.lerp(trackX0, trackX1, handleT);
    const rawValue = AxiomMath.map(handleX, trackX0, trackX1, fromMin, fromMax);
    const t = AxiomMath.inverseLerp(fromMin, fromMax, rawValue);
    const mapped = AxiomMath.map(
      rawValue,
      fromMin,
      fromMax,
      toMin,
      toMax,
      true,
    );

    ctx.fillStyle = "#ffd43b";
    ctx.beginPath();
    ctx.arc(handleX, trackY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(`${rawValue.toFixed(1)}`, handleX - 12, trackY - 12);

    const barX = q.D.x + q.D.w - 44;
    const barY0 = q.D.y + 30;
    const barY1 = q.D.y + q.D.h - 40;

    const clampedBarValue = AxiomMath.clamp(barValue, toMin, toMax);
    const reverseMapped = AxiomMath.map(
      clampedBarValue,
      toMin,
      toMax,
      fromMin,
      fromMax,
    );
    const reverseX = AxiomMath.map(
      reverseMapped,
      fromMin,
      fromMax,
      trackX0,
      trackX1,
    );

    ctx.strokeStyle = "#555";
    ctx.strokeRect(barX, barY0, 22, barY1 - barY0);
    ctx.fillStyle = "#888";
    ctx.fillText(`${toMax}`, barX - 30, barY0 + 4);
    ctx.fillText(`${toMin}`, barX - 30, barY1 + 4);

    const fillY = AxiomMath.map(
      clampedBarValue,
      toMin,
      toMax,
      barY1,
      barY0,
      true,
    );
    ctx.fillStyle = "#51cf66";
    ctx.fillRect(barX, fillY, 22, barY1 - fillY);

    const rawY = AxiomMath.map(
      barValue,
      toMin - 70,
      toMax + 70,
      barY1 + 50,
      barY0 - 50,
    );
    ctx.fillStyle = barValue !== clampedBarValue ? "#ff6b6b" : "#ffd43b";
    ctx.beginPath();
    ctx.arc(barX + 11, rawY, 6, 0, Math.PI * 2);
    ctx.fill();

    const forwardMarkerY = AxiomMath.map(
      mapped,
      toMin,
      toMax,
      barY1,
      barY0,
      true,
    );
    ctx.strokeStyle = "#4dabf7";
    ctx.beginPath();
    ctx.moveTo(barX - 4, forwardMarkerY);
    ctx.lineTo(barX + 26, forwardMarkerY);
    ctx.stroke();

    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(reverseX, trackY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.fillText(
      `map(${rawValue.toFixed(1)}, ${fromMin}, ${fromMax}, ${toMin}, ${toMax}, clamp) = ${mapped.toFixed(1)} (niebieska kreska na pasku)`,
      q.D.x + 8,
      q.D.y + q.D.h - 40,
    );
    ctx.fillText(
      `pasek: przeciągnij = ${barValue.toFixed(0)}   clamp(${barValue.toFixed(0)}, ${toMin}, ${toMax}) = ${clampedBarValue.toFixed(0)}`,
      q.D.x + 8,
      q.D.y + q.D.h - 24,
    );
    ctx.fillText(
      `map(${clampedBarValue.toFixed(0)}, ${toMin}, ${toMax}, ${fromMin}, ${fromMax}) = ${reverseMapped.toFixed(1)} (czerwona kropka na górnym suwaku)`,
      q.D.x + 8,
      q.D.y + q.D.h - 8,
    );
  });

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
