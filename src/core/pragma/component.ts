import PragmaActor from "./actor";
import { EnginePhase, ITERATED_PHASES } from "./pragma";

abstract class PragmaComponent {
  public readonly phases: EnginePhase;
  public readonly actor: PragmaActor;
  public readonly name: string;
  private isComponentEnabled: boolean = true;

  constructor(internal: InternalPCProps) {
    this.actor = internal.actor;
    this.name = this.constructor.name;
    let mask = EnginePhase.none;
    for (const phase of ITERATED_PHASES) {
      if (this[phase]) mask |= EnginePhase[phase];
    }
    this.phases = mask;
  }
  public destroySelf() {
    this.actor.destroyComponent(this.constructor as PragmaComponentClass);
  }
  public getSibling<T extends PragmaComponentClass>(Ctor: T) {
    return this.actor.getComponent(Ctor);
  }
  public get scene() {
    return this.actor.scene;
  }
  public get tags() {
    return this.actor.tags;
  }
  public setEnabled(enable: boolean) {
    this.isComponentEnabled = enable;
  }
  public getEnabled() {
    return this.isComponentEnabled;
  }
  public emitActorEvent<T>(name: string, data: T) {
    this.actor.events.emit(name, data);
  }
  public onActorEvent<T>(name: string, cb: (data: T) => void) {
    this.actor.events.on(name, cb);
  }
  public offActorEvent<T>(name: string, cb: (data: T) => void) {
    this.actor.events.off(name, cb);
  }
  public emitSceneEvent<T>(name: string, data: T) {
    this.actor.scene.events.emit(name, data);
  }
  public onSceneEvent<T>(name: string, cb: (data: T) => void) {
    this.actor.scene.events.on(name, cb);
  }
  public offSceneEvent<T>(name: string, cb: (data: T) => void) {
    this.actor.scene.events.off(name, cb);
  }
  public get systemSharedData() {
    return this.scene.sharedData;
  }
}

interface PragmaComponent {
  awake?(): void;
  start?(): void;
  destroy?(): void;
  preFixedUpdate?(): void;
  fixedUpdate?(): void;
  preUpdate?(): void;
  update?(): void;
  postUpdate?(): void;
  render?(): void;
}

export default PragmaComponent;
