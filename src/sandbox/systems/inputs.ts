import Dogma from "@/core/dogma/dogma";
import EntityManager from "@/core/dogma/entityManager";
import DogmaSystem, { InternalDSProps } from "@/core/dogma/system";
import InputManager from "@/core/engine/inputManager";
const MOVE_SPEED = 200;
const JUMP_FORCE = -600;
export default class Inputs extends DogmaSystem {
  constructor(internalProps: InternalDSProps) {
    super(internalProps);
  }
  public onStart(): void {
    // this.subscribeToPhase({
    //   phase: "preUpdate",
    //   callback: this.handleInputs.bind(this),
    // });
    this.subscribeToPhase({
      phase: "preUpdate",
      callback: () => this.events.emitCascade("test", { test: 1 }),
    });

    // this.events.subscribeToDeferred({
    //   callback: () => this.delEnt(),
    //   eventName: "deleteEntity",
    //   sysRef: this,
    // });
  }

  private handleInputs() {
    const physics = this.getComponentWithMarker("Player", "Phys");
    if (!physics) return;

    if (InputManager.isKeyHold("d")) {
      physics.velocity.x = MOVE_SPEED;
    } else if (InputManager.isKeyHold("a")) {
      physics.velocity.x = -MOVE_SPEED;
    } else {
      physics.velocity.x = 0;
    }

    // Skok w osi Y (tylko gdy stoimy na ziemi!)
    if (InputManager.isKeyHold("w") && physics.isGrounded) {
      physics.velocity.y = JUMP_FORCE;
      physics.isGrounded = false; // Natychmiast odrywamy od ziemi
    }
  }
  private logs() {
    this.events.emitCascade("test", { test: 1 });
  }
  private delEnt() {
    const physics = this.getComponentWithMarker("Player", "Phys");
    if (!physics) return;
    if (physics.isGrounded) {
      physics.velocity.y = JUMP_FORCE;
      physics.isGrounded = false; // Natychmiast odrywamy od ziemi
    }
    // EntityManager.removeEntity(physics.ID, "Main");
  }
}
