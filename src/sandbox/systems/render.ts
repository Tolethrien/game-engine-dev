import Dogma from "@/core/dogma/dogma";
import DogmaSystem, { InternalDSProps } from "@/core/dogma/system";
import Engine from "@/core/engine/engine";
import Time from "@/core/engine/time";

export default class Render extends DogmaSystem {
  constructor(internalProps: InternalDSProps) {
    super(internalProps);
  }
  public onStart(): void {
    this.subscribeToPhase({
      phase: "postUpdate",
      callback: this.renderScene.bind(this),
    });
  }
  private renderScene() {
    const ev = this.events.getCascade("test");
    console.log(ev);
    const alpha = Time.getAlpha();
    const transforms = this.getComponentList("Transform");
    if (!transforms) return;

    transforms.forEach(({ position, prevPosition, size }) => {
      const renderX = prevPosition.x + (position.x - prevPosition.x) * alpha;
      const renderY = prevPosition.y + (position.y - prevPosition.y) * alpha;

      Engine.ctx.fillRect(renderX, renderY, size.width, size.height);
    });
  }
}
