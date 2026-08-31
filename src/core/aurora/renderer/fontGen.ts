import Renderer from "./renderer";
// chars: QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890[];',./ -=_+{}:"<>?!@#$%^&*()|\żźćŻŹĆęĘóÓłŁńŃąĄ`~
export interface MsdfChar {
  id: number;
  index: number;
  char: string;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
  chnl: number;
  x: number;
  y: number;
  page: number;
  charIndex: number;
}
interface Messure {
  text: string;
  fontSize: number;
  fontName: string;
}
interface KerningChar {
  first: number;
  second: number;
  amount: number;
}
export interface FontJson {
  chars: MsdfChar[];
  kernings?: KerningChar[];
  common: {
    lineHeight: number;
    scaleW: number;
    scaleH: number;
  };
}
type KerningMap = Map<number, Map<number, number>>;
export interface FontData {
  lineHeight: number;
  chars: Record<number, MsdfChar>;
  kernings?: KerningMap;
  defaultChar: MsdfChar;
  // bind: [GPUBindGroup, GPUBindGroupLayout];
  charCount: number;
  scale: { w: number; h: number };
}
export interface FontGenProps {
  fontName: string;
  img: string;
  json: DeepOmit<FontJson, "chars.charIndex">;
}

export default class FontGen {
  private name: FontGenProps["fontName"];
  private imgUrl: FontGenProps["img"];
  private jsonData: FontGenProps["json"];
  private meta!: FontData;
  private index: number;

  public static async generateFont(props: FontGenProps & { index: number }) {
    const font = new FontGen(props);
    await font.generator();
    if (font.meta === undefined)
      console.error(
        `No specific data in Font:  "${props.fontName}" while generating...`,
      );
    return font;
  }

  private constructor({
    fontName,
    img,
    json,
    index,
  }: FontGenProps & { index: number }) {
    this.name = fontName;
    this.imgUrl = img;
    this.jsonData = json;
    this.index = index;
  }

  public get getMeta() {
    return this.meta;
  }
  public get getFontGenerationInfo() {
    return {
      name: this.name,
      imgUrl: this.imgUrl,
      JsonUsed: this.jsonData,
    };
  }
  public get getIndex() {
    return this.index;
  }
  public getCharDataByCode(code: number) {
    return this.meta.chars[code];
  }
  public static measureText({ fontName, fontSize, text }: Messure) {
    const fontMeta = Renderer.getUserFontData(fontName).getMeta;
    const { chars, kernings, lineHeight } = fontMeta;
    const scale = fontSize / lineHeight;
    let width = 0;
    const height = lineHeight * scale;
    let lastCode: number | null = null;

    for (const char of text) {
      const code = char.charCodeAt(0);
      const charData: MsdfChar = chars[code] ?? fontMeta.defaultChar;
      width += charData.xadvance * scale;
      lastCode = code;
      if (!kernings || lastCode === null) continue;
      const kernRow = kernings.get(lastCode);
      if (!kernRow) continue;
      const kernAmount = kernRow.get(code) || 0;
      width += kernAmount * scale;
    }
    return { width, height };
  }

  private async generator() {
    const u = 1 / this.jsonData.common.scaleW;
    const v = 1 / this.jsonData.common.scaleH;
    const data: number[] = [];
    (this.jsonData.chars as MsdfChar[]).forEach((c, i) => {
      const offset = i * 8;
      data[offset] = c.x * u;
      data[offset + 1] = c.y * v;
      data[offset + 2] = c.width * u;
      data[offset + 3] = c.height * v;
      data[offset + 4] = c.width;
      data[offset + 5] = c.height;
      data[offset + 6] = c.xoffset;
      data[offset + 7] = -c.yoffset;
      c.charIndex = i;
    });
    //TODO: for the ui version
    // const buffer = Aurora.createMappedBuffer({
    //   bufferType: "storage",
    //   data: data,
    //   dataType: "Float32Array",
    //   label: `FontBuffer-${this.name}`,
    // });
    // const texture = await Aurora.createTexture({
    //   label: `MSDF font texture ${this.name}`,
    //   url: this.imgUrl,
    //   format: "rgba8unorm",
    // });
    // const bindGroup = Aurora.creteBindGroup({
    //   layout: {
    //     entries: [
    //       { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    //       { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
    //       {
    //         binding: 2,
    //         visibility: GPUShaderStage.VERTEX,
    //         buffer: { type: "read-only-storage" },
    //       },
    //     ],
    //     label: `font-${this.name} BindLayout`,
    //   },
    //   data: {
    //     entries: [
    //       { binding: 0, resource: Batcher.getSampler("fontGen") },
    //       { binding: 1, resource: texture.texture.createView() },
    //       { binding: 2, resource: { buffer: buffer } },
    //     ],
    //     label: `font-${this.name} BindData`,
    //   },
    // });
    const chars = (this.jsonData.chars as MsdfChar[]).reduce<
      Record<number, MsdfChar>
    >((acc, char) => ({ ...acc, [char.id]: char }), {});
    const charArray = Object.values(chars);
    const kernings: KerningMap = new Map();
    if (this.jsonData.kernings) {
      this.jsonData.kernings.forEach((kerning) => {
        let kerningList = kernings.get(kerning.first);
        if (!kerningList) {
          kerningList = new Map();
          kernings.set(kerning.first, kerningList);
        }
        kerningList.set(kerning.second, kerning.amount);
      });
    }
    this.meta = {
      // bind: bindGroup,
      chars,
      kernings,
      lineHeight: this.jsonData.common.lineHeight,
      charCount: charArray.length,
      defaultChar: charArray[0],
      scale: { w: this.jsonData.common.scaleW, h: this.jsonData.common.scaleH },
    };
  }
}
