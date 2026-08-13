import Vec2 from "@/core/axiom/vec2";
import PragmaComponent, { InternalPCProps } from "@/core/pragma/component";
import Pragma from "@/core/pragma/pragma";

export default class Sraka extends PragmaComponent {
  public position: Vec2;
  constructor(internal: InternalPCProps) {
    super(internal);
    this.position = Vec2.Zero;
  }
  public update() {
    console.log("sraka update");
  }
  public preUpdate() {
    console.log("sraka pre");
  }
  public postUpdate() {
    console.log("sraka post");
  }
  public render() {
    console.log("sraka render");
  }
  public fixedUpdate() {
    console.log("sraka fixed");
  }
  public awake() {
    console.log("sraka awake");
  }
  public start() {
    console.log("sraka start");
  }
  public destroy() {
    console.log("sraka destroy");
  }
}
