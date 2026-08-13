import PragmaActor from "@/core/pragma/actor";

export default class Player extends PragmaActor {
  constructor() {
    super();
    const a = this.getComponent("Transform")!;
    const b = a.getPosition();
  }
}
