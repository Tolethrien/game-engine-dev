import DogmaEntity from "@dogma/entity";
import Dogma from "./dogma";

export default class EntityManager {
  public static spawnEntity(ent: DogmaEntity, sceneName: string) {
    const scene = Dogma.getScene(sceneName);

    ent.getComponents().forEach((comp) => {
      scene.componentsToDispatch.add(comp);
    });
  }
  public static removeEntity(entID: DogmaEntity["ID"], sceneName: string) {
    const scene = Dogma.getScene(sceneName);
    scene.componentsToRemove.add(entID);
  }
}
