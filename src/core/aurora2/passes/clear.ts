import Aurora from "../core";
import { Pass, PassResources } from "../pass";

export default class ClearPass extends Pass<"render"> {
  public readonly name = "clear";
  public readonly type = "render";

  resources(res: PassResources) {
    const color = Aurora.getSettings.rendering.canvasColor;
    const alpha = color[3] / 255;
    res.write(
      "scene",
      { size: { scale: 1 }, format: "rgba16float" },
      {
        loadOp: "clear",
        clearValue: [
          (color[0] / 255) * alpha,
          (color[1] / 255) * alpha,
          (color[2] / 255) * alpha,
          alpha,
        ],
      },
    );
  }

  execute() {}
}
