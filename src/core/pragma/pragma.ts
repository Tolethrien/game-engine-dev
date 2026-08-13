import PragmaActor from "./actor";
import { EventBus } from "./eventManager";
import PragmaScene from "./scene";

export const enum EnginePhase {
  none = 0,
  awake = 1 << 0, // 1
  start = 1 << 1, // 2
  fixedUpdate = 1 << 2, // 4
  preUpdate = 1 << 3, // 8
  update = 1 << 4, // 16
  postUpdate = 1 << 5, // 32
  render = 1 << 6, // 64
  destroy = 1 << 7, // 128
}
export default class Pragma {
  private static sceneList: Map<string, PragmaScene> = new Map();
  public static readonly events = new EventBus();

  public static addScene(sceneName: string, active?: boolean) {
    const scene = new PragmaScene({ sceneName, active });
    this.sceneList.set(sceneName, scene);
    return scene;
  }
  public static deleteScene(sceneName: string) {
    const scene = this.sceneList.get(sceneName);
    if (!scene) {
      console.warn(`There is no scene with name: ${sceneName} to remove`);
      return;
    }
    scene.getAllActors.forEach((actor) => actor.onDestroy());
    this.sceneList.delete(sceneName);
  }
  public static getScene(sceneName: string) {
    return this.sceneList.get(sceneName);
  }
  public static update() {
    this.sceneList.forEach((scene) => scene.active && scene.update());
  }
  public static addActor(actor: PragmaActor, sceneName: string) {
    const scene = this.sceneList.get(sceneName);
    if (!scene) {
      console.warn(
        `There is no scene with name ${sceneName}. Trying add actor: ${actor.ID}`,
      );
      return;
    }
    scene.spawnActor(actor);
  }
  public static deleteActor(actor: PragmaActor, sceneName: string) {
    const scene = this.sceneList.get(sceneName);
    if (!scene) {
      console.warn(
        `There is no scene with name ${sceneName}. Trying to remove actor: ${actor.ID}`,
      );
      return;
    }
    scene.deleteActor(actor);
  }
  public static emitGlobalEvent<T>(name: string, data: T) {
    this.events.emit(name, data);
  }
  public static onGlobalEvent<T>(name: string, cb: (data: T) => void) {
    this.events.on(name, cb);
  }
  public static offGlobalEvent<T>(name: string, cb: (data: T) => void) {
    this.events.off(name, cb);
  }
}
