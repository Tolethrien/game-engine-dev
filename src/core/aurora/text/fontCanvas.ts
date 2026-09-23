import type { DynamicFontSource } from "./font";

export default class FontCanvas {
  private static canvas: OffscreenCanvas | null = null;
  private static context: OffscreenCanvasRenderingContext2D;
  private static currentFont = "";

  public static async load(source: DynamicFontSource) {
    const face = new FontFace(this.family(source.name), `url(${source.url})`);
    await face.load();
    document.fonts.add(face);
  }

  public static family(name: string) {
    return `aurora-${name}`;
  }

  public static font(name: string, size: number) {
    return `${size}px "${this.family(name)}"`;
  }

  public static scratch(
    font: string,
    width: number,
    height: number,
    kerning: CanvasFontKerning = "normal",
  ) {
    let canvas = this.canvas;
    if (!canvas) {
      canvas = this.canvas = new OffscreenCanvas(256, 256);
      this.context = canvas.getContext("2d", { willReadFrequently: true })!;
      this.resetStyle();
    }
    if (canvas.width < width || canvas.height < height) {
      // resizing wipes the whole context state
      canvas.width = Math.max(canvas.width, width);
      canvas.height = Math.max(canvas.height, height);
      this.resetStyle();
    }
    const context = this.context;
    // parsing the font string is the costly part of measuring a pair
    if (this.currentFont !== font) {
      context.font = font;
      this.currentFont = font;
    }
    context.fontKerning = kerning;
    return context;
  }

  private static resetStyle() {
    const context = this.context;
    context.fillStyle = "white";
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    this.currentFont = "";
  }
}
