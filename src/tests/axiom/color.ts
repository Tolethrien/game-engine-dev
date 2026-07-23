import AxiomColor from "@/core/axiom/color";
import AxiomMath from "@/core/axiom/math";

const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
window.addEventListener("resize", resize);
resize();

let hue = 200;
let sat = 80;
let light = 50;

let colorA = "#ff3b30";
let colorB = "#0a84ff";

const mouse = { x: 0, y: 0, down: false };

function randomHex(): string {
  const n = Math.floor(Math.random() * 0xffffff);
  return "#" + n.toString(16).padStart(6, "0");
}

const PAD = 24;
const roundTripY = PAD;
const roundTripH = 190;

const hslPickerY = roundTripY + roundTripH + 40;
const hueStripH = 24;
const slSize = 180;

const lerpY = hslPickerY + slSize + 60;
const lerpH = 40;

const rgbaY = lerpY + lerpH + 80;
const rgbaH = 100;

function rect(x: number, y: number, w: number, h: number) {
  return { x, y, w, h };
}
function inRect(
  px: number,
  py: number,
  r: { x: number; y: number; w: number; h: number },
) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
function drawSwatch(
  x: number,
  y: number,
  w: number,
  h: number,
  hex: string,
  label?: string,
) {
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#000";
  ctx.strokeRect(x, y, w, h);
  if (label) {
    ctx.fillStyle = "#fff";
    ctx.font = "11px monospace";
    ctx.fillText(label, x, y + h + 14);
  }
}
function drawCheckerboard(
  x: number,
  y: number,
  w: number,
  h: number,
  size = 8,
) {
  for (let j = 0; j < h; j += size) {
    for (let i = 0; i < w; i += size) {
      const even = (i / size + j / size) % 2 === 0;
      ctx.fillStyle = even ? "#888" : "#ccc";
      ctx.fillRect(x + i, y + j, size, size);
    }
  }
}

const testColors = [
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffaa00",
  "#7f3fbf",
  "#123456",
];

function drawRoundTrip() {
  ctx.fillStyle = "#fff";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "1) round-trip konwersji (hex -> rgb/hsl -> hex)",
    PAD,
    roundTripY - 6,
  );

  const cols = [
    { label: "oryginał", w: 150 },
    { label: "hex->rgb->hex", w: 150 },
    { label: "hex->hsl->hex", w: 150 },
    { label: "hex->rgb->hsl->rgb->hex", w: 190 },
  ];
  const rowH = 22;
  const swatchSize = 16;
  const tableX = PAD;
  const headerY = roundTripY + 12;
  const firstRowY = headerY + 10;

  ctx.font = "11px monospace";
  let hx = tableX;
  for (const col of cols) {
    ctx.fillStyle = "#aaa";
    ctx.fillText(col.label, hx, headerY);
    hx += col.w;
  }

  testColors.forEach((hex, row) => {
    const y = firstRowY + row * rowH;

    const rgb = AxiomColor.hexToRgb(hex);
    const viaRgb = AxiomColor.rgbToHex(rgb);

    const hsl = AxiomColor.hexToHsl(hex);
    const viaHsl = AxiomColor.hslToHex(hsl);

    const hsl2 = AxiomColor.rgbToHsl(rgb);
    const rgb2 = AxiomColor.hslToRgb(hsl2);
    const viaBoth = AxiomColor.rgbToHex(rgb2);

    const cells = [
      { value: hex, checked: false },
      { value: viaRgb, checked: true },
      { value: viaHsl, checked: true },
      { value: viaBoth, checked: true },
    ];

    let x = tableX;
    cells.forEach((cell, i) => {
      const ok = cell.value.toLowerCase() === hex.toLowerCase();

      ctx.fillStyle = cell.value;
      ctx.fillRect(x, y, swatchSize, swatchSize);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(x, y, swatchSize, swatchSize);

      ctx.font = "11px monospace";
      ctx.fillStyle = !cell.checked ? "#fff" : ok ? "#51cf66" : "#ff6b6b";
      const suffix = !cell.checked ? "" : ok ? " OK" : " FAIL";
      ctx.fillText(
        `${cell.value}${suffix}`,
        x + swatchSize + 6,
        y + swatchSize - 4,
      );

      x += cols[i].w;
    });
  });
}

const hueStripRect = rect(PAD, hslPickerY, 360, hueStripH);
const slSquareRect = rect(PAD, hslPickerY + hueStripH + 10, slSize, slSize);

function drawHslPicker() {
  ctx.fillStyle = "#fff";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "2) interaktywny HSL picker (rusz myszką po pasku i kwadracie)",
    PAD,
    hslPickerY - 6,
  );

  const img = ctx.createImageData(hueStripRect.w, 1);
  for (let x = 0; x < hueStripRect.w; x++) {
    const h = (x / hueStripRect.w) * 360;
    const [r, g, b] = AxiomColor.hslToRgb([h, 100, 50]);
    img.data.set([r, g, b, 255], x * 4);
  }
  const tmp = document.createElement("canvas");
  tmp.width = hueStripRect.w;
  tmp.height = 1;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  ctx.drawImage(
    tmp,
    hueStripRect.x,
    hueStripRect.y,
    hueStripRect.w,
    hueStripRect.h,
  );
  ctx.strokeStyle = "#000";
  ctx.strokeRect(
    hueStripRect.x,
    hueStripRect.y,
    hueStripRect.w,
    hueStripRect.h,
  );

  const hx = hueStripRect.x + (hue / 360) * hueStripRect.w;
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(hx, hueStripRect.y);
  ctx.lineTo(hx, hueStripRect.y + hueStripRect.h);
  ctx.stroke();

  const sImg = ctx.createImageData(slSquareRect.w, slSquareRect.h);
  for (let y = 0; y < slSquareRect.h; y++) {
    const l = 100 - (y / slSquareRect.h) * 100;
    for (let x = 0; x < slSquareRect.w; x++) {
      const s = (x / slSquareRect.w) * 100;
      const [r, g, b] = AxiomColor.hslToRgb([hue, s, l]);
      const idx = (y * slSquareRect.w + x) * 4;
      sImg.data.set([r, g, b, 255], idx);
    }
  }
  const tmp2 = document.createElement("canvas");
  tmp2.width = slSquareRect.w;
  tmp2.height = slSquareRect.h;
  tmp2.getContext("2d")!.putImageData(sImg, 0, 0);
  ctx.drawImage(tmp2, slSquareRect.x, slSquareRect.y);
  ctx.strokeRect(
    slSquareRect.x,
    slSquareRect.y,
    slSquareRect.w,
    slSquareRect.h,
  );

  const cx = slSquareRect.x + (sat / 100) * slSquareRect.w;
  const cy = slSquareRect.y + (1 - light / 100) * slSquareRect.h;
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.stroke();

  const resultHex = AxiomColor.hslToHex([hue, sat, light]);
  const resultRgb = AxiomColor.hslToRgb([hue, sat, light]);
  drawSwatch(
    slSquareRect.x + slSquareRect.w + 30,
    slSquareRect.y,
    80,
    80,
    resultHex,
  );
  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(
    `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`,
    slSquareRect.x + slSquareRect.w + 30,
    slSquareRect.y + 100,
  );
  ctx.fillText(
    `rgb(${resultRgb.join(", ")})`,
    slSquareRect.x + slSquareRect.w + 30,
    slSquareRect.y + 118,
  );
  ctx.fillText(
    resultHex,
    slSquareRect.x + slSquareRect.w + 30,
    slSquareRect.y + 136,
  );
}

const lerpBarRect = rect(PAD, lerpY + 40, 400, lerpH);
let manualT: number | null = null;

function drawLerp() {
  ctx.fillStyle = "#fff";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "3) AxiomMath.lerpRGB (kliknij = losuj kolory, najedź na pasek = scrub)",
    PAD,
    lerpY - 6,
  );

  drawSwatch(PAD, lerpY + 6, 30, 30, colorA, "A");
  drawSwatch(PAD + 40, lerpY + 6, 30, 30, colorB, "B");

  const rgbA = AxiomColor.hexToRgb(colorA);
  const rgbB = AxiomColor.hexToRgb(colorB);

  const img = ctx.createImageData(lerpBarRect.w, 1);
  for (let x = 0; x < lerpBarRect.w; x++) {
    const t = x / lerpBarRect.w;
    const [r, g, b] = AxiomMath.lerpRGB(rgbA, rgbB, t);
    img.data.set([r, g, b, 255], x * 4);
  }
  const tmp = document.createElement("canvas");
  tmp.width = lerpBarRect.w;
  tmp.height = 1;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  ctx.drawImage(
    tmp,
    lerpBarRect.x,
    lerpBarRect.y,
    lerpBarRect.w,
    lerpBarRect.h,
  );
  ctx.strokeRect(lerpBarRect.x, lerpBarRect.y, lerpBarRect.w, lerpBarRect.h);

  const autoT = (Math.sin(performance.now() / 800) + 1) / 2;
  const t = manualT ?? autoT;
  const markerX = lerpBarRect.x + t * lerpBarRect.w;
  ctx.strokeStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(markerX, lerpBarRect.y - 4);
  ctx.lineTo(markerX, lerpBarRect.y + lerpBarRect.h + 4);
  ctx.stroke();

  const currentRgb = AxiomMath.lerpRGB(rgbA, rgbB, t);
  const currentHex = AxiomColor.rgbToHex(currentRgb);
  drawSwatch(
    lerpBarRect.x + lerpBarRect.w + 20,
    lerpBarRect.y - 5,
    50,
    50,
    currentHex,
    `t=${t.toFixed(2)}`,
  );
}

const rgbaBoxRect = rect(PAD, rgbaY + 20, 200, rgbaH);

function drawRgba() {
  ctx.fillStyle = "#fff";
  ctx.font = "14px sans-serif";
  ctx.fillText(
    "4) rgba/alpha (rgbaToHex / hexToRgba, AxiomMath.lerpRGBA)",
    PAD,
    rgbaY - 6,
  );

  drawCheckerboard(rgbaBoxRect.x, rgbaBoxRect.y, rgbaBoxRect.w, rgbaBoxRect.h);

  const rgbaA: [number, number, number, number] = [255, 0, 0, 0.2];
  const rgbaB: [number, number, number, number] = [0, 100, 255, 0.9];

  for (let x = 0; x < rgbaBoxRect.w; x++) {
    const t = x / rgbaBoxRect.w;
    const [r, g, b, a] = AxiomMath.lerpRGBA(rgbaA, rgbaB, t);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    ctx.fillRect(rgbaBoxRect.x + x, rgbaBoxRect.y, 1, rgbaBoxRect.h);
  }
  ctx.strokeRect(rgbaBoxRect.x, rgbaBoxRect.y, rgbaBoxRect.w, rgbaBoxRect.h);

  const hexA = AxiomColor.rgbaToHex(rgbaA);
  const hexB = AxiomColor.rgbaToHex(rgbaB);
  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(
    `A: ${hexA}  ->  hexToRgba: [${AxiomColor.hexToRgba(hexA).join(", ")}]`,
    rgbaBoxRect.x,
    rgbaBoxRect.y + rgbaBoxRect.h + 16,
  );
  ctx.fillText(
    `B: ${hexB}  ->  hexToRgba: [${AxiomColor.hexToRgba(hexB).join(", ")}]`,
    rgbaBoxRect.x,
    rgbaBoxRect.y + rgbaBoxRect.h + 32,
  );
}

function draw() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawRoundTrip();
  drawHslPicker();
  drawLerp();
  drawRgba();

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

canvas.addEventListener("mousemove", (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;

  if (mouse.down && inRect(mouse.x, mouse.y, hueStripRect)) {
    hue = Math.max(
      0,
      Math.min(360, ((mouse.x - hueStripRect.x) / hueStripRect.w) * 360),
    );
  }
  if (mouse.down && inRect(mouse.x, mouse.y, slSquareRect)) {
    sat = Math.max(
      0,
      Math.min(100, ((mouse.x - slSquareRect.x) / slSquareRect.w) * 100),
    );
    light = Math.max(
      0,
      Math.min(100, 100 - ((mouse.y - slSquareRect.y) / slSquareRect.h) * 100),
    );
  }
  if (mouse.down && inRect(mouse.x, mouse.y, lerpBarRect)) {
    manualT = Math.max(
      0,
      Math.min(1, (mouse.x - lerpBarRect.x) / lerpBarRect.w),
    );
  }
});

canvas.addEventListener("mousedown", (e) => {
  mouse.down = true;
  const x = e.offsetX;
  const y = e.offsetY;
  if (inRect(x, y, hueStripRect))
    hue = ((x - hueStripRect.x) / hueStripRect.w) * 360;
  if (inRect(x, y, slSquareRect)) {
    sat = ((x - slSquareRect.x) / slSquareRect.w) * 100;
    light = 100 - ((y - slSquareRect.y) / slSquareRect.h) * 100;
  }
  if (inRect(x, y, lerpBarRect)) {
    manualT = (x - lerpBarRect.x) / lerpBarRect.w;
  } else if (y > lerpY && y < rgbaY) {
    colorA = randomHex();
    colorB = randomHex();
  }
});

window.addEventListener("mouseup", () => {
  mouse.down = false;
  manualT = null;
});
