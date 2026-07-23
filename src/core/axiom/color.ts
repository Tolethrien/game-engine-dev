export default class AxiomColor {
  //RGB To ->
  static rgbToHex([r, g, b]: RGB): string {
    const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
