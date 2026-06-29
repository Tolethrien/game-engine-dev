import DogmaEntity from "@dogma/entity";
import Dogma from "./dogma";

export default class EntityManager {
  public static spawnEntity(ent: DogmaEntity, sceneName: string) {
    const scene = Dogma.getScene(sceneName);
    scene.entityToDispatch.add(ent);
  }
  public static removeEntity(entID: DogmaEntity["ID"], sceneName: string) {
    const scene = Dogma.getScene(sceneName);
    scene.entityToRemove.add(entID);
  }
  // public static cloneEntity() {}
  // public static moveEntity() {}
}
