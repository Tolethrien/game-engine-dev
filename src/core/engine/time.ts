export default class Time {
  private static readonly MAX_DELTA_TIME: number = 1000 / 10; //10FPS
  private static readonly FIXED_DT: number = 1000 / 60; // 60FPS

  private static deltaTime: number = 0;
  private static alpha: number = 0;
  private static currentTime: number = 0;
  private static lastTime: number = 0;
  private static accumulator: number = 0;
  private static currentFrameDt: number = 0;

  public static getDeltaTime() {
    return this.deltaTime;
  }
  public static getFixedDeltaTime() {
    return this.FIXED_DT;
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

  public static update(currentTime: number) {
    let dt = currentTime - this.lastTime;
    this.lastTime = currentTime;
    if (dt > this.MAX_DELTA_TIME) dt = this.MAX_DELTA_TIME;
    this.accumulator += dt;
    this.currentFrameDt = dt;
    this.currentTime += dt;
  }

  public static requestFixedUpdate() {
    if (this.accumulator >= this.FIXED_DT) {
      this.deltaTime = this.FIXED_DT;
      this.accumulator -= this.FIXED_DT;
      return true;
    }
    return false;
  }

  public static switchToUpdateContext() {
    this.deltaTime = this.currentFrameDt;
  }

  public static updateAlpha() {
    this.alpha = this.accumulator / this.FIXED_DT;
  }
}
