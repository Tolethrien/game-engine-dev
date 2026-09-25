import "@/css/index.css";
import { assert } from "@axiom/utils";
import Time from "./time";
import { debug } from "@debug";
import FPSOverlay from "./fpsOverlay";
import InputManager from "./inputManager";
import Navi from "../navi/navi";
import { Signal, SignalListeners } from "../axiom/events";
import Aurora from "@aurora/core";

export default class Engine {
  declare private static canvas: HTMLCanvasElement;
  declare private static context: GPUCanvasContext;
  private static update: (() => void) | null = null;
  private static signals = {
    windowResize: new Signal<Size2D>(),
    engineInit: new Signal<boolean>(),
  };
  public static readonly events: SignalListeners<typeof Engine.signals> =
    this.signals;
  public static async initialize({
    preload,
    setup,
    update,
  }: {
    preload: () => Promise<void>;
    setup: () => void;
    update?: () => void;
  }) {
    this.update = update ?? null;
    await this.setCanvas();
    InputManager.registerEvents();
    await Aurora.init(this.canvas);
    FPSOverlay.setGpuTimeSource(() => Aurora.getGpuTime);
    Navi.initialize();
    Time.initTimer(performance.now());
    await preload();
    setup();
    await Aurora.build();
    this.signals.engineInit.emit(true);
    requestAnimationFrame((currentTime) => this.loop(currentTime));
  }
  public static get ctx() {
    return this.context;
  }
  private static loop(currentTime: number) {
    Time.update(currentTime);
    InputManager.updateInputs();
    Aurora.beginFrame();
    Navi.updateSystem();

    Time.switchToUpdateContext();
    this.update?.();
    //=================================

    // Pragma.update(); // pick one
    // Dogma.tickAll(); // pick one
    Navi.drawSystem();
    Aurora.endFrame();
    Time.endFrame();
    FPSOverlay.update();

    debug.performance.endFrame(Time.getFrameTime());
    debug.log.endFrame();
    // before watch, so a changed value shows up in the same frame
    debug.command.endFrame();
    debug.tweak.endFrame();
    debug.watch.endFrame();

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
        this.signals.windowResize.emit(pendingSize);
        pendingSize = null;
        debounceTimer = null;
      }, DEBOUNCE_MS);
    });
  }
}
