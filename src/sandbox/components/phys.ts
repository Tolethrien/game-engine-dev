import DogmaComponent, { InternalDCProps } from "@/core/dogma/component";
interface PhysProps {}
export default class Phys extends DogmaComponent {
  public velocity: Position2D;
  public acceleration: Position2D;
  public gravityScale: number;
  public isGrounded: boolean;
  constructor(internalProps: InternalDCProps, props: PhysProps) {
    super(internalProps);
    this.velocity = { x: 0, y: 0 };
    this.acceleration = { x: 0, y: 0 };
    this.gravityScale = 1;
    this.isGrounded = false;
  }
}
