export default class AxiomColor {
  //RGB To ->
  static rgbToHex([r, g, b]: RGB): string {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  static randomRGBA(): RGBA {
    return [
      Math.random() * 255 + 1,
      Math.random() * 255 + 1,
      Math.random() * 255 + 1,
      Math.random() * 255 + 1,
    ];
  }
  static randomRGB(): RGB {
    return [
      Math.random() * 255 + 1,
      Math.random() * 255 + 1,
      Math.random() * 255 + 1,
    ];
  }
  // per channel on the stored values (srgb 0-255), no rounding
  static lerpRGBA(from: Readonly<RGBA>, to: Readonly<RGBA>, t: number): RGBA {
    return [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
      from[3] + (to[3] - from[3]) * t,
    ];
  }
  static rgbaToHex([r, g, b, a]: RGBA): string {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a * 255)}`;
  }
  static rgbToHsl([r, g, b]: RGB): HSL {
    const rn = r / 255,
      gn = g / 255,
      bn = b / 255;
    const max = Math.max(rn, gn, bn),
      min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;

    if (max === min) return [0, 0, l * 100];

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    return [h * 60, s * 100, l * 100];
  }
  static rgbaToHsla([r, g, b, a]: RGBA): HSLA {
    const [h, s, l] = AxiomColor.rgbToHsl([r, g, b]);
    return [h, s, l, a];
  }
  //HEX TO ->
  static hexToRgb(hex: string): RGB {
    const clean = hex.replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return [r, g, b];
  }

  static hexToRgba(hex: string): RGBA {
    const clean = hex.replace("#", "");
    const [r, g, b] = AxiomColor.hexToRgb(hex);
    const a = clean.length >= 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, a];
  }
  static hexToHsl(hex: string): HSL {
    const [r, g, b] = AxiomColor.hexToRgb(hex);
    return AxiomColor.rgbToHsl([r, g, b]);
  }

  static hexToHsla(hex: string): HSLA {
    const [r, g, b, a] = AxiomColor.hexToRgba(hex);
    const [h, s, l] = AxiomColor.rgbToHsl([r, g, b]);
    return [h, s, l, a];
  }
  //HSL TO ->
  static hslToRgb([h, s, l]: HSL): RGB {
    const hn = h / 360,
      sn = s / 100,
      ln = l / 100;

    if (sn === 0) {
      const v = Math.round(ln * 255);
      return [v, v, v];
    }

    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    const r = this.hue2rgb(p, q, hn + 1 / 3);
    const g = this.hue2rgb(p, q, hn);
    const b = this.hue2rgb(p, q, hn - 1 / 3);

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  static hslaToRgba([h, s, l, a]: HSLA): RGBA {
    const [r, g, b] = AxiomColor.hslToRgb([h, s, l]);
    return [r, g, b, a];
  }
  static hslToHex([h, s, l]: HSL): string {
    const [r, g, b] = AxiomColor.hslToRgb([h, s, l]);
    return AxiomColor.rgbToHex([r, g, b]);
  }

  static hslaToHex([h, s, l, a]: HSLA): string {
    const [r, g, b] = AxiomColor.hslToRgb([h, s, l]);
    return AxiomColor.rgbaToHex([r, g, b, a]);
  }
  private static hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
}
const rgba = (r: number, g: number, b: number, a = 255) =>
  Object.freeze([r, g, b, a]) as RGBA;

export const COLOR = {
  // neutral
  TRANSPARENT: rgba(0, 0, 0, 0),
  WHITE: rgba(255, 255, 255),
  SNOW: rgba(255, 250, 250),
  IVORY: rgba(255, 255, 240),
  SILVER: rgba(192, 192, 192),
  LIGHT_GRAY: rgba(211, 211, 211),
  GRAY: rgba(128, 128, 128),
  DARK_GRAY: rgba(64, 64, 64),
  CHARCOAL: rgba(36, 36, 36),
  BLACK: rgba(0, 0, 0),

  // red and pink
  RED: rgba(255, 0, 0),
  DARK_RED: rgba(139, 0, 0),
  CRIMSON: rgba(220, 20, 60),
  MAROON: rgba(128, 0, 0),
  SALMON: rgba(250, 128, 114),
  CORAL: rgba(255, 127, 80),
  TOMATO: rgba(255, 99, 71),
  PINK: rgba(255, 192, 203),
  HOT_PINK: rgba(255, 105, 180),
  DEEP_PINK: rgba(255, 20, 147),

  // orange and brown
  ORANGE: rgba(255, 165, 0),
  DARK_ORANGE: rgba(255, 140, 0),
  AMBER: rgba(255, 191, 0),
  PEACH: rgba(255, 218, 185),
  BROWN: rgba(139, 69, 19),
  CHOCOLATE: rgba(210, 105, 30),
  TAN: rgba(210, 180, 140),
  BEIGE: rgba(245, 245, 220),

  // yellow
  YELLOW: rgba(255, 255, 0),
  GOLD: rgba(255, 215, 0),
  LEMON: rgba(255, 250, 205),
  KHAKI: rgba(240, 230, 140),
  OLIVE: rgba(128, 128, 0),

  // green
  GREEN: rgba(0, 255, 0),
  DARK_GREEN: rgba(0, 100, 0),
  FOREST_GREEN: rgba(34, 139, 34),
  LIME: rgba(50, 205, 50),
  MINT: rgba(152, 255, 152),
  SEA_GREEN: rgba(46, 139, 87),
  EMERALD: rgba(80, 200, 120),
  TEAL: rgba(0, 128, 128),

  // cyan and blue
  CYAN: rgba(0, 255, 255),
  TURQUOISE: rgba(64, 224, 208),
  AQUAMARINE: rgba(127, 255, 212),
  SKY_BLUE: rgba(135, 206, 235),
  LIGHT_BLUE: rgba(173, 216, 230),
  BLUE: rgba(0, 0, 255),
  ROYAL_BLUE: rgba(65, 105, 225),
  DODGER_BLUE: rgba(30, 144, 255),
  STEEL_BLUE: rgba(70, 130, 180),
  NAVY: rgba(0, 0, 128),
  MIDNIGHT_BLUE: rgba(25, 25, 112),

  // purple
  PURPLE: rgba(128, 0, 128),
  VIOLET: rgba(238, 130, 238),
  INDIGO: rgba(75, 0, 130),
  LAVENDER: rgba(230, 230, 250),
  PLUM: rgba(221, 160, 221),
  ORCHID: rgba(218, 112, 214),
  MAGENTA: rgba(255, 0, 255),
} as const;
