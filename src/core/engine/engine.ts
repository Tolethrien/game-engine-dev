import "@/css/index.css";
import { assert } from "@utils/utils";
import Time from "@engine/time";
import Pragma from "../pragma/pragma";
import { debug } from "@debug";
export default class Engine {
  declare private static canvas: HTMLCanvasElement;
  declare private static context: CanvasRenderingContext2D;
  public static async initialize({
    preload,
    setup,
  }: {
    preload: () => Promise<void>;
    setup: () => void;
  }) {
    await this.setCanvas();
    Time.initTimer(performance.now());
    await preload();
    setup();
    requestAnimationFrame((currentTime) => this.loop(currentTime));
  }
  public static get ctx() {
    return this.context;
  }
  private static loop(currentTime: number) {
    debug.performance.startFrame();
    Time.update(currentTime);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    Pragma.update();
    debug.performance.endFrame(Time.getFrameTime());
    requestAnimationFrame((currentTime) => this.loop(currentTime));
  }

  private static async setCanvas() {
    const DEBOUNCE_MS = 100;
    let debounceTimer: number | null = null;
    let pendingSize: Size2D | null = null;
    const canvas = document.getElementById(
      "gameWindow",
    ) as HTMLCanvasElement | null;
    assert(canvas !== null, "There is no canvas element with ID: gameWindow");
    this.canvas = canvas;
    this.context = canvas.getContext("2d")!;
    const size = await window.API.WINDOW.getWindowSize();
    canvas.width = size.width;
    canvas.height = size.height;

    window.API.WINDOW.onWindowResize((size) => {
      pendingSize = size;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (!pendingSize) return;
        canvas.width = pendingSize.width;
        canvas.height = pendingSize.height;
        pendingSize = null;
        debounceTimer = null;
      }, DEBOUNCE_MS);
    });
  }
}
