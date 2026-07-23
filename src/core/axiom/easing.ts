export default class Easing {
  private constructor() {}

  static linear(t: number) {
    return t;
  }

  static easeInQuad(t: number) {
    return t * t;
  }
  static easeOutQuad(t: number) {
    return t * (2 - t);
  }
  static easeInOutQuad(t: number) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  static easeInCubic(t: number) {
    return t ** 3;
  }
  static easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }
  static easeInOutCubic(t: number) {
    return t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  static easeInSine(t: number) {
    return 1 - Math.cos((t * Math.PI) / 2);
  }
  static easeOutSine(t: number) {
    return Math.sin((t * Math.PI) / 2);
  }
  static easeInOutSine(t: number) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }
}
