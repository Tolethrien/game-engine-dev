import Entity from "@/core/dogma/entity";

export default class EntitA extends Entity {
  constructor() {
    super();
    this.addComponent("Move", { speed: 1 });
    this.addComponent("Trans", { vel: 1 });
  }
}
