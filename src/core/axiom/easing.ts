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
  static easeInBack(t: number) {
    const c1 = 1.70158;
    return (c1 + 1) * t ** 3 - c1 * t * t;
  }
  static easeOutBack(t: number) {
    const c1 = 1.70158;
    return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  static easeInOutBack(t: number) {
    const c2 = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;
  }
}
