import { assert } from "@/utils/utils";
import Dogma, { SharedData } from "./dogma";
import Scene from "./scene";
import { dogmaConfig } from "@/sandbox/configs";
/**
 * queraski TODO
 * - wez liste komponentu
 * - wez konkretny komponent z markerem
 * - wez konkretne komponenty z tagami
 * - wez encje gdzie znajduja sie okreslone komponenty
 */
export interface InternalDSProps {
  scene: Scene;
  systemName: SystemRegistryKeys;
}
interface PhaseSubscriber {
  phase: DogmaPhase;
  callback: () => void;
  after?: SystemRegistryKeys[];
  before?: SystemRegistryKeys[];
}
type queryMinArgs = [
  ComponentRegistryKeys,
  ComponentRegistryKeys,
  ...ComponentRegistryKeys[],
];
type EnforceUnique<T extends any[], Visited = never> = T extends [
  infer Head,
  ...infer Tail,
]
  ? Head extends Visited
    ? ["Duplicated Component:", Head]
    : [Head, ...EnforceUnique<Tail, Visited | Head>]
  : [];
type SystemComponent<T extends ComponentRegistryKeys> =
  (typeof dogmaConfig.components)[T] extends new (...args: any[]) => infer R
    ? R
    : never;
type SystemComponentList<T extends ComponentRegistryKeys> = Map<
  Symbol,
  SystemComponent<T>
>;
export default abstract class DogmaSystem {
  private systemActive: boolean = true;
  declare private parentScene: Scene;
  declare public readonly systemName: SystemRegistryKeys;
  public constructor(internal: InternalDSProps) {
    this.parentScene = internal.scene;
    this.systemName = internal.systemName;
  }

  public setActive(bool: boolean) {
    this.systemActive = bool;
  }

  public isActive() {
    return this.systemActive;
  }
  public setSharedData<T extends SharedData>(
    type: "global" | "local",
    name: string,
    data: T,
  ) {
    if (type === "local") this.parentScene.sceneSharedData.set(name, data);
    else if (type === "global") Dogma.globalSharedData.set(name, data);
  }
  public getSharedData<T extends SharedData>(
    type: "global" | "local",
    name: string,
  ) {
    if (type === "local")
      return this.parentScene.sceneSharedData.get(name) as T | undefined;
    else if (type === "global")
      return Dogma.globalSharedData.get(name) as T | undefined;
  }
  public removeSharedData(type: "global" | "local", name: string) {
    if (type === "local") this.parentScene.sceneSharedData.delete(name);
    else if (type === "global") Dogma.globalSharedData.delete(name);
  }
  public getComponentList<T extends ComponentRegistryKeys>(name: T) {
    return this.parentScene.getComponentList(name) as
      | SystemComponentList<T>
      | undefined;
  }
  public query<T extends queryMinArgs>(list: T & EnforceUnique<T>) {
    const key = list.sort().join("|");
    const query = this.parentScene.getQueryResult(key);
    if (query) return query;
    return this.parentScene.createQuery(key, list);
  }
  public subscribeToPhase(subscriber: PhaseSubscriber) {
    this.parentScene.addToScenePhase({
      callback: subscriber.callback,
      phaseName: subscriber.phase,
      sysRef: this,
      systemName: this.systemName,
      after: new Set(subscriber.after ?? []),
      before: new Set(subscriber.before ?? []),
    });
  }
  public unSubscribeFromPhase(phase: DogmaPhase) {
    this.parentScene.removeFromScenePhase({
      phaseName: phase,
      systemName: this.systemName,
      sysRef: this,
    });
  }

  //MAIN OVERRIDES
  /**@description this will happen ones right after the new frame start, good for debugging and timing*/
  public onFrameStart() {}
  /**@description this will happen ones on system first load*/
  public onStart() {}
  /**@description this will happen ones before system destroyed*/
  public onDestroy() {}
  /**@description this will happen ones at the end of frame, good for debugging and timing*/
  public onFrameEnd() {}
}
