import DogmaComponent from "./component";
import Dogma, { SharedData } from "./dogma";
import EventManager, { EventData } from "./eventManager";
import Scene from "./scene";
import { dogmaConfig } from "@/sandbox/configs";

export interface InternalDSProps {
  scene: Scene;
  systemName: DogmaSystemRegistryKeys;
}
interface PhaseSubscriber {
  phase: DogmaPhase;
  callback: () => void;
  after?: DogmaSystemRegistryKeys[];
  before?: DogmaSystemRegistryKeys[];
}

type UniqueStringTuple<
  T extends readonly string[],
  Seen extends string = never,
> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? Head extends Seen
      ? never
      : [
          Head,
          ...UniqueStringTuple<
            Tail extends readonly string[] ? Tail : [],
            Seen | Head
          >,
        ]
    : never
  : [];

export type SystemComponent<T extends DogmaComponentRegistryKeys> =
  (typeof dogmaConfig.components)[T] extends new (...args: any[]) => infer R
    ? R
    : never;
export type SystemComponentList<T extends DogmaComponentRegistryKeys> = Map<
  Symbol,
  SystemComponent<T>
>;
export default abstract class DogmaSystem {
  private systemActive: boolean = true;
  declare private parentScene: Scene;
  declare public readonly systemName: DogmaSystemRegistryKeys;
  public constructor({ scene, systemName }: InternalDSProps) {
    this.parentScene = scene;
    this.systemName = systemName;
  }

  /**@description set activity of a system, when false system will not be executed */
  public setActive(bool: boolean) {
    this.systemActive = bool;
  }

  /**@description returns activity of a system */
  public isActive() {
    return this.systemActive;
  }

  /**@description returns current frame meta for this scene of entities life cycle */
  public getEntitiesInFrameMeta() {
    return this.parentScene.entitiesInFrame;
  }

  /**@description sets any of user shared data based of access lvl, global - available in all Scenes, scene - available only in current scene */
  public setSharedData<T extends SharedData>(
    type: "global" | "scene",
    name: string,
    data: T,
  ) {
    if (type === "scene") this.parentScene.sceneSharedData.set(name, data);
    else if (type === "global") Dogma.globalSharedData.set(name, data);
  }

  /**@description returns shared data based of access lvl */
  public getSharedData<T extends SharedData>(
    type: "global" | "scene",
    name: string,
  ) {
    if (type === "scene")
      return this.parentScene.sceneSharedData.get(name) as T | undefined;
    else if (type === "global")
      return Dogma.globalSharedData.get(name) as T | undefined;
  }

  /**@description removes shared data based of access lvl */
  public removeSharedData(type: "global" | "scene", name: string) {
    if (type === "scene") this.parentScene.sceneSharedData.delete(name);
    else if (type === "global") Dogma.globalSharedData.delete(name);
  }

  /**@description returns full list of specific components in frame */
  public getComponentList<T extends DogmaComponentRegistryKeys>(name: T) {
    return this.parentScene.getComponentList(name) as
      | SystemComponentList<T>
      | undefined;
  }

  /**@description returns specific component from components list */
  public getComponent<T extends DogmaComponentRegistryKeys>(
    ID: Symbol,
    componentName: T,
  ) {
    return this.parentScene.getComponentList(componentName)?.get(ID) as
      | SystemComponent<T>
      | undefined;
  }

  /**@description returns and cache list of entities ID's with this specific component and tags */
  public getComponentsWithTags<
    T extends DogmaComponentRegistryKeys,
    const U extends readonly [string, ...string[]],
  >(component: T, tags: U & UniqueStringTuple<U>) {
    const key = tags.sort().join("|");
    const query = this.parentScene.getTagsQueryResults(key);
    if (query) return query;
    return this.parentScene.createTagsQuery(key, tags, component);
  }

  /**@description returns and cache specific ID of a specific Entity with this marker */
  public getComponentWithMarker<T extends DogmaComponentRegistryKeys>(
    marker: string,
    componentName: T,
  ) {
    const list = this.parentScene.getComponentList(componentName);
    const id = this.parentScene.getMarkerQuery(marker);
    if (!id || !list) return undefined;
    return list.get(id) as SystemComponent<T> | undefined;
  }

  /**@description returns and cache list of entities ID's with this specific combination of components */
  public getComponentsGroup<
    T extends DogmaComponentRegistryKeys,
    const U extends readonly [T, T, ...T[]],
  >(list: U & UniqueStringTuple<U>) {
    const key = list.sort().join("|");
    const query = this.parentScene.getQueryResult(key);
    if (query) return query;
    return this.parentScene.createQuery(key, list);
  }

  /**@description adds a new tag to specific entity and all of his components by accessing one of his components and update tags cache */
  public addEntityTag(component: DogmaComponent, tag: string) {
    component.tags.add(tag);
    this.parentScene.updateTagsQuery(tag, component);
  }

  /**@description removes tag from specific entity and all of his components by accessing one of his components and update tags cache */
  public removeEntityTag(component: DogmaComponent, tag: string) {
    component.tags.delete(tag);
    this.parentScene.updateTagsQuery(tag, component);
  }

  /**@description subscribe function to a specific loop phase. Note! callback need to be "()=>callback()" or callback.bind(this) */
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

  /**@description unsubscribe function from a specific loop phase. */
  public unSubscribeFromPhase(phase: DogmaPhase) {
    this.parentScene.removeFromScenePhase({
      phaseName: phase,
      systemName: this.systemName,
    });
  }
  public get events() {
    return this.parentScene.eventManager;
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
