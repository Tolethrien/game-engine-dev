import DogmaEntity from "@/core/dogma/entity";

export default class Player extends DogmaEntity {
  constructor() {
    super();
    this.addComponent("Transform", {
      position: { x: 10, y: 10 },
      size: { width: 100, height: 100 },
    });
    this.addComponent("Phys", {});
    this.setMarker("Player");
    this.addTag("human");
  }
}
