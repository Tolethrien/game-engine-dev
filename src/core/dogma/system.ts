import Scene from "./scene";
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
export default abstract class DogmaSystem {
  private systemActive: boolean = true;
  declare private parentScene: Scene;
  declare private shaderData: Map<string, Record<string, unknown>>;
  declare public readonly systemName: SystemRegistryKeys;
  public constructor(internal: InternalDSProps) {
    this.parentScene = internal.scene;
    this.systemName = internal.systemName;
  }

  public getComponentList<T extends ComponentRegistryKeys>(name: T) {
    return this.parentScene.getComponentList(name);
  }

  public addToSharedData<T extends Record<string, unknown>>(
    name: string,
    data: T,
  ) {
    this.shaderData.set(name, data);
  }
  public getFromSharedData<T extends Record<string, unknown>>(name: string) {
    return this.shaderData.get(name) as T | undefined;
  }
  public deleteFromSharedData(name: string) {
    this.shaderData.delete(name);
  }
  public setActive(bool: boolean) {
    this.systemActive = bool;
  }
  public isActive() {
    return this.systemActive;
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
  public unSubscribeFromPhase(phase: DogmaPhase, func: () => void) {
    this.parentScene.removeFromScenePhase({
      callback: func,
      phaseName: phase,
      sysRef: this,
      systemName: this.systemName,
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
