const tests = [
  { id: "color", label: "Color" },
  { id: "easing", label: "Easing" },
  { id: "grid", label: "Grid" },
  { id: "quad", label: "QuadTree" },
  { id: "spatial", label: "SpatialGrid" },
  { id: "aabb", label: "AABB" },
  { id: "cols", label: "Collision" },
  { id: "math", label: "Math" },
  { id: "vec2", label: "Vec2" },
  { id: "mat", label: "Mat4" },
];

const params = new URLSearchParams(window.location.search);
const activeId = params.get("test") ?? tests[0].id;

const bar = document.createElement("div");
bar.style.position = "fixed";
bar.style.top = "0";
bar.style.left = "0";
bar.style.right = "0";
bar.style.zIndex = "1000";
bar.style.display = "flex";
bar.style.flexWrap = "wrap";
bar.style.gap = "4px";
bar.style.padding = "6px";
bar.style.background = "rgba(0,0,0,0.6)";
bar.style.fontFamily = "monospace";
document.body.appendChild(bar);

for (const test of tests) {
  const btn = document.createElement("button");
  btn.textContent = test.label;
  btn.style.padding = "6px 10px";
  btn.style.background = test.id === activeId ? "#4dabf7" : "#222";
  btn.style.color = "#fff";
  btn.style.border = "1px solid #444";
  btn.style.cursor = "pointer";
  btn.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("test", test.id);
    window.location.href = url.toString(); // pełny reload = darmowy cleanup
  });
  bar.appendChild(btn);
}
const canvas = document.getElementById("gameWindow") as HTMLCanvasElement;

function pushCanvasBelowBar() {
  canvas.style.marginTop = `${bar.offsetHeight}px`;
}
pushCanvasBelowBar();
window.addEventListener("resize", pushCanvasBelowBar);
const active = tests.find((t) => t.id === activeId) ?? tests[0];
import(`./${active.id}.ts`);
