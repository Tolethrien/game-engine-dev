import DogmaSystem, { InternalDSProps } from "@/core/dogma/system";
import Time from "@/core/engine/time";

const GLOBAL_GRAVITY = 980; // Pixele na sekundę do kwadratu (odpowiednik 9.8 m/s^2)
const FLOOR_Y = 650; // Tymczasowa podłoga na osi Y

export default class Physics extends DogmaSystem {
  public onStart(): void {
    this.subscribeToPhase({
      phase: "fixedUpdate",
      callback: this.updatePhysics.bind(this),
      after: ["Inputs"],
    });
    this.subscribeToPhase({
      phase: "preUpdate",
      callback: () => this.events.emitCascade("test", { test: 3 }),
    });
  }

  private updatePhysics() {
    const dt = Time.getFixedDeltaTime() / 1000; // Konwersja na sekundy

    const entities = this.getComponentsGroup(["Transform", "Phys"]);

    entities.forEach((entity) => {
      const transform = this.getComponent(entity, "Transform");
      const physics = this.getComponent(entity, "Phys");
      if (!transform || !physics) return;
      transform.prevPosition.x = transform.position.x;
      transform.prevPosition.y = transform.position.y;

      if (!physics.isGrounded) {
        physics.velocity.y += GLOBAL_GRAVITY * physics.gravityScale * dt;
      }

      transform.position.x += physics.velocity.x * dt;
      transform.position.y += physics.velocity.y * dt;

      const bottomY = transform.position.y + transform.size.height;
      if (bottomY >= FLOOR_Y) {
        transform.position.y = FLOOR_Y - transform.size.height;
        physics.velocity.y = 0;
        physics.isGrounded = true;
      }
    });
  }
}
