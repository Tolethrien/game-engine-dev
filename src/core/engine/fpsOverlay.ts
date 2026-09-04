import Time from "./time";

type GpuTimeSource = () => number | null;
const REFRESH_MS = 1000;
export default class FPSOverlay {
  private static element: HTMLDivElement | null = null;
  private static lastRefresh = 0;
  private static visible = false;
  private static gpuSource: GpuTimeSource | null = null;

  public static setVisible(value: boolean) {
    this.visible = value;
    if (!value) {
      this.element?.remove();
      this.element = null;
      return;
    }
    if (!this.element) this.mount();
  }

  public static isVisible() {
    return this.visible;
  }
  public static setGpuTimeSource(source: GpuTimeSource | null) {
    this.gpuSource = source;
  }
  public static update() {
    if (!this.visible || !this.element) return;

    const now = performance.now();
    if (now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;

    const gpuTime = this.gpuSource?.() ?? null;

    this.element.textContent =
      `FPS  ${Time.getFps()}\n` +
      `CPU  ${Time.getCpuTime().toFixed(2)} ms\n` +
      `GPU  ${gpuTime === null ? "—" : `${gpuTime.toFixed(2)} ms`}`;
  }

  private static mount() {
    const element = document.createElement("div");
    element.style.cssText = [
      "position:fixed",
      "top:8px",
      "left:8px",
      "z-index:9999",
      "padding:4px 8px",
      "font:12px/1 Consolas,monospace",
      "white-space:pre",
      "color:#7cff9b",
      "background:rgba(0,0,0,.55)",
      "border-radius:4px",
      "pointer-events:none",
      "user-select:none",
    ].join(";");
    document.body.appendChild(element);
    this.element = element;
  }
}
