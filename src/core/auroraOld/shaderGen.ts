import Aurora from "./core";

export default class ShaderGen {
  private shader: GPUShaderModule | undefined;
  private body: string;
  private name: string;

  public constructor(name: string, body: string) {
    this.name = name;
    this.body = body;
  }
  public get getShader() {
    return this.shader!;
  }
  public get getBody() {
    return this.body;
  }
  public compile() {
    this.shader = Aurora.createShader(this.name, this.body);
  }
  public replace(lines: Record<string, string>) {
    Object.entries(lines).forEach((entry) => {
      const pattern = `/\\* @${entry[0]} \\*/`;
      const reg = new RegExp(pattern, "s");
      this.body = this.body.replace(reg, entry[1]);
    });
    return this;
  }
}
