import "@/css/index.css";
import { assert } from "@axiom/utils";
import Time from "./time";
import { debug } from "@debug";
import Aurora from "@aurora/core";
import Renderer from "@aurora/renderer/renderer";
import AuroraDebugInfo from "@aurora/debugger/debugInfo";
import Draw from "@aurora/draw";
import FPSOverlay from "./fpsOverlay";
import InputManager from "./inputManager";
import Navi from "../navi/navi";
export default class Engine {
  declare private static canvas: HTMLCanvasElement;
  declare private static context: GPUCanvasContext;
  public static async initialize({
    preload,
    setup,
  }: {
    preload: () => Promise<void>;
    setup: () => void;
  }) {
    await this.setCanvas();
    InputManager.registerEvents();
    await Aurora.init(this.canvas);
    Navi.initialize();
    Time.initTimer(performance.now());
    await preload();
    setup();
    requestAnimationFrame((currentTime) => this.loop(currentTime));
  }
  public static get ctx() {
    return this.context;
  }
  private static loop(currentTime: number) {
    Time.update(currentTime);
    AuroraDebugInfo.startCount(currentTime);
    InputManager.updateInputs();
    Navi.updateSystem();

    Renderer.beginBatch();

    // temporary for develop ========================
    Renderer.setGlobalIllumination([10, 0, 0]);
    Draw.rect({
      position: { x: 100, y: 100, z: 1 },
      size: { height: 100, width: 100 },
      tint: [255, 0, 255, 255],
      emissive: 3.7,
    });
    Draw.pointLight({
      position: { x: 300, y: 300, z: 1 },
      size: { height: 500, width: 500 },
      tint: [255, 0, 255],
      intensity: 100,
    });
    Time.switchToUpdateContext();
    //=================================

    // Pragma.update(); // pick one
    // Dogma.tickAll(); // pick one
    Navi.drawSystem();
    Renderer.endBatch();
    AuroraDebugInfo.endCount();
    debug.aurora.reportGPUData(AuroraDebugInfo.getAllData);
    Time.endFrame();
    FPSOverlay.update();
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
    this.context = canvas.getContext("webgpu")!;
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
