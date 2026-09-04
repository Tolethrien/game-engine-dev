export default class Time {
  private static readonly MAX_DELTA_TIME: number = 1000 / 10; //10FPS
  private static readonly FIXED_DT: number = 1000 / 60; // 60FPS
  private static readonly FIXED_DT_S: number = 1000 / 60 / 1000;
  //fps counter
  private static fps = 0;
  private static fpsFrames = 0;
  private static fpsElapsedMs = 0;
  private static cpuTimeMs = 0;
  private static frameStart = 0;
  //
  private static paused: boolean = false;
  private static deltaTime: number = 0;
  private static frameTime: number = 0;
  private static alpha: number = 0;
  private static currentTime: number = 0;
  private static lastTime: number = 0;
  private static accumulator: number = 0;
  private static currentFrameDt: number = 0;
  private static timeSpeed: number = 1;

  private static speedLerp: {
    from: number;
    to: number;
    duration: number;
    elapsed: number;
  } | null = null;

  public static getFrameTime() {
    return this.frameTime;
  }
  public static getDeltaTime() {
    if (this.paused) return 0;
    return this.deltaTime * this.timeSpeed;
  }

  public static getUnscaledDeltaTime() {
    if (this.paused) return 0;
    return this.deltaTime;
  }
  public static getRawDeltaTime() {
    return this.deltaTime;
  }

  public static getFixedDeltaTime() {
    if (this.paused) return 0;
    return this.FIXED_DT_S * this.timeSpeed;
  }
  public static setPaused(paused: boolean) {
    this.paused = paused;
  }
  public static getPaused() {
    return this.paused;
  }
  public static getAlpha() {
    return this.alpha;
  }
  public static getTime() {
    return this.currentTime;
  }
  public static getTimeInSeconds() {
    return this.currentTime / 1000;
  }

  public static initTimer(startTime: number) {
    this.lastTime = startTime;
  }
  public static setTimeSpeed(speed: number) {
    this.timeSpeed = speed;
    this.speedLerp = null;
  }
  public static setLerpTimeSpeed(target: number, duration: number) {
    this.speedLerp = { from: this.timeSpeed, to: target, duration, elapsed: 0 };
  }
  public static update(currentTime: number) {
    this.frameStart = performance.now();

    const raw = currentTime - this.lastTime;
    this.lastTime = currentTime;
    this.countFps(raw);

    let dt = raw > this.MAX_DELTA_TIME ? this.MAX_DELTA_TIME : raw;
    this.accumulator += dt;
    this.currentFrameDt = dt;
    this.currentTime += dt;
    this.updateSpeedLerp(dt);
  }

  public static requestFixedUpdate() {
    if (this.accumulator >= this.FIXED_DT) {
      this.accumulator -= this.FIXED_DT;
      return true;
    }
    return false;
  }

  public static switchToUpdateContext() {
    this.deltaTime = this.currentFrameDt / 1000;
    this.frameTime = this.currentFrameDt;
  }

  public static updateAlpha() {
    this.alpha = this.accumulator / this.FIXED_DT;
  }
  private static updateSpeedLerp(dtMs: number) {
    if (!this.speedLerp || this.paused) return;
    this.speedLerp.elapsed += dtMs / 1000;
    const t = Math.min(this.speedLerp.elapsed / this.speedLerp.duration, 1);
    this.timeSpeed =
      this.speedLerp.from + (this.speedLerp.to - this.speedLerp.from) * t;
    if (t >= 1) this.speedLerp = null;
  }
  public static endFrame() {
    this.cpuTimeMs = performance.now() - this.frameStart;
  }

  private static countFps(rawDtMs: number) {
    this.fpsFrames++;
    this.fpsElapsedMs += rawDtMs;
    if (this.fpsElapsedMs < 1000) return;
    this.fps = this.fpsFrames;
    this.fpsFrames = 0;
    this.fpsElapsedMs -= 1000;
  }

  public static getFps() {
    return this.fps;
  }
  public static getCpuTime() {
    return this.cpuTimeMs;
  }
}
