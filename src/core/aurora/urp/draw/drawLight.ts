import { COLOR } from "@axiom/color";
import { debug } from "@debug";
import VertexLayout from "@aurora/utils/vertexLayout";
import type LightPass from "../passes/lightPass";
import { clearShapeData, writeCorners } from "./drawInternal";
import type {
  AmbientLight,
  EllipseLight,
  LightBase,
  PointLight,
  RectLight,
} from "./drawTypes";

// must match InstanceIn in shaders/lightShader.wgsl, locations in field order
export const LIGHT_LAYOUT = new VertexLayout(
  {
    position: "float32x2",
    size: "float32x2",
    rotation: "float32",
    color: "unorm8x4",
    intensity: "float32",
    shape: "uint32",
    softness: "float32",
    falloff: "float32",
    // box: corner radii, like shapeData of a draw instance
    shapeData: "float32x4",
  },
  { stepMode: "instance" },
);
export type LightWriter = ReturnType<typeof LIGHT_LAYOUT.createWriter>;

// must match SHAPE_* in shaders/lightShader.wgsl
export enum LightShape {
  Box = 0,
  Ellipse = 1,
}
const DEFAULT_FALLOFF = 4;

export class LightDraw {
  // null until the pass is set up, lights before that only warn
  private target: LightPass | null = null;
  private readonly targetWarning = debug.log.scope("auroraURP").once();
  // state, unlike lights it stays until changed
  private readonly ambient: AmbientLight = {
    enabled: true,
    from: COLOR.WHITE,
    to: COLOR.WHITE,
    angle: 0,
    intensity: 1,
  };

  public setTarget(target: LightPass) {
    this.target = target;
  }
  public get getAmbient(): Readonly<AmbientLight> {
    return this.ambient;
  }

  public get getEnabled() {
    return this.ambient.enabled;
  }
  public setAmbient(props: Partial<AmbientLight>) {
    Object.assign(this.ambient, props);
  }
  public point(props: PointLight) {
    const { position, radius } = props;
    const size = radius * 2;
    const view = this.writeLight(props, size, size);
    if (!view) return;
    view.position(position.x - radius, position.y - radius);
    view.rotation(0);
    view.shape(LightShape.Box);
    view.softness(radius);
    writeCorners(view, radius);
  }
  public rect(props: RectLight) {
    const { position, size } = props;
    const view = this.writeLight(props, size.width, size.height);
    if (!view) return;
    view.position(position.x, position.y);
    view.rotation(props.rotation ?? 0);
    view.shape(LightShape.Box);
    view.softness(
      props.softness ?? Math.min(size.width, size.height) / 2,
    );
    writeCorners(view, props.rounded);
  }
  public ellipse(props: EllipseLight) {
    const { position, size } = props;
    const view = this.writeLight(props, size.width, size.height);
    if (!view) return;
    view.position(position.x - size.width / 2, position.y - size.height / 2);
    view.rotation(props.rotation ?? 0);
    view.shape(LightShape.Ellipse);
    view.softness(
      props.softness ?? Math.min(size.width, size.height) / 2,
    );
    clearShapeData(view);
  }

  private writeLight(props: LightBase, width: number, height: number) {
    if (!this.ambient.enabled) return null;
    const color = props.color ?? COLOR.WHITE;
    const intensity = props.intensity ?? 1;
    if (color[3] === 0 || intensity <= 0 || width <= 0 || height <= 0) {
      return null;
    }
    const target = this.target;
    if (!target) {
      this.warnNoTarget();
      return null;
    }
    const view = target.push();
    view.size(width, height);
    view.color(color[0], color[1], color[2], color[3]);
    view.intensity(intensity);
    view.falloff(props.falloff ?? DEFAULT_FALLOFF);
    return view;
  }
  private warnNoTarget() {
    this.targetWarning.warn(
      "Light: nothing to draw into yet, call it after URP.init and Aurora.build",
    );
  }
}

// the instance the light pass drives, games get it narrowed from draw.ts
export const lightDraw = new LightDraw();
