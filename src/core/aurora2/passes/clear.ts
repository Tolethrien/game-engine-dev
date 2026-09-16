import Aurora from "../core";
import { RenderPass, PassResources } from "../pass";

export default class ClearPass extends RenderPass {
  public readonly name = "clear";

  resources(res: PassResources) {
    const color = Aurora.getSettings.rendering.canvasColor;
    const alpha = color[3] / 255;
    res.create(
      "scene",
      { size: { scale: 1 }, format: "rgba16float" },
      {
        clearValue: [
          Aurora.colorChannel(color[0]) * alpha,
          Aurora.colorChannel(color[1]) * alpha,
          Aurora.colorChannel(color[2]) * alpha,
          alpha,
        ],
      },
    );
  }

  execute() {}
}
