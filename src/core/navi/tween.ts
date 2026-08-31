import Easing from "../axiom/easing";

export interface TweenSample {
  scaleX?: number;
  scaleY?: number;
  x?: number; // px() and py()
  y?: number;
  alpha?: number;
}

export interface Tween {
  ms: number;
  loop: boolean;
  delay: number;
  sample: (t: number) => TweenSample;
  onDone: (() => void) | undefined;
  elapsed: number;
}

export type EaseFn = (t: number) => number;

function make(
  ms: number,
  sample: (t: number) => TweenSample,
  loop = false,
  onDone?: () => void,
): Tween {
  return { ms, loop, sample, onDone, elapsed: 0, delay: 0 };
}

export const Tweens = {
  after(delay: number, tween: Tween) {
    tween.delay = delay;
    return tween;
  },
  slideIn(
    from: Position2D,
    ms = 220,
    ease: EaseFn = Easing.easeOutCubic,
    onDone?: () => void,
  ) {
    return make(
      ms,
      (t) => {
        const k = 1 - ease(t);
        return { x: from.x * k, y: from.y * k };
      },
      false,
      onDone,
    );
  },

  slideOut(
    to: Position2D,
    ms = 160,
    ease: EaseFn = Easing.easeInCubic,
    onDone?: () => void,
  ) {
    return make(
      ms,
      (t) => {
        const k = ease(t);
        return { x: to.x * k, y: to.y * k };
      },
      false,
      onDone,
    );
  },

  popIn(ms = 180, ease: EaseFn = Easing.easeOutBack, onDone?: () => void) {
    return make(
      ms,
      (t) => {
        const k = ease(t);
        return { scaleX: k, scaleY: k };
      },
      false,
      onDone,
    );
  },

  popOut(ms = 120, ease: EaseFn = Easing.easeInCubic, onDone?: () => void) {
    return make(
      ms,
      (t) => {
        const k = 1 - ease(t);
        return { scaleX: k, scaleY: k };
      },
      false,
      onDone,
    );
  },

  shake(amp = 6, times = 3, ms = 320, onDone?: () => void) {
    return make(
      ms,
      (t) => ({ x: Math.sin(t * Math.PI * 2 * times) * amp * (1 - t) }),
      false,
      onDone,
    );
  },

  shakeY(amp = 6, times = 3, ms = 320, onDone?: () => void) {
    return make(
      ms,
      (t) => ({ y: Math.sin(t * Math.PI * 2 * times) * amp * (1 - t) }),
      false,
      onDone,
    );
  },

  hop(height = 10, ms = 260, onDone?: () => void) {
    return make(
      ms,
      (t) => ({ y: -Math.sin(t * Math.PI) * height }),
      false,
      onDone,
    );
  },

  pulse(amount = 0.06, ms = 900) {
    return make(
      ms,
      (t) => {
        const k = 1 + Math.sin(t * Math.PI * 2) * amount;
        return { scaleX: k, scaleY: k };
      },
      true,
    );
  },
  fadeIn(ms = 200, ease: EaseFn = Easing.easeOutQuad, onDone?: () => void) {
    return make(ms, (t) => ({ alpha: ease(t) }), false, onDone);
  },

  fadeOut(ms = 200, ease: EaseFn = Easing.easeInQuad, onDone?: () => void) {
    return make(ms, (t) => ({ alpha: 1 - ease(t) }), false, onDone);
  },

  scaleTo(
    to = 1.8,
    ms = 400,
    ease: EaseFn = Easing.easeOutCubic,
    onDone?: () => void,
  ) {
    return make(
      ms,
      (t) => {
        const k = 1 + (to - 1) * ease(t);
        return { scaleX: k, scaleY: k };
      },
      false,
      onDone,
    );
  },
  //text - kursor
  caretBlink(ms = 1060) {
    return make(ms, (t) => ({ alpha: t < 0.5 ? 1 : 0 }), true);
  },
};
