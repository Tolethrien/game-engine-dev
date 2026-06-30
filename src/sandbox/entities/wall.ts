import DogmaEntity from "@/core/dogma/entity";

export default class Wall extends DogmaEntity {
  constructor() {
    super();
    this.addComponent("Transform", {
      position: { x: 0, y: 650 },
      size: { width: 1700, height: 50 },
    });
  }
}
