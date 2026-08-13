import PragmaActor from "./actor";
import { EnginePhase } from "./pragma";

export interface InternalPCProps {
  actor: PragmaActor;
  componentName: PragmaComponentRegistryKeys;
}
abstract class PragmaComponent {
  public readonly phases: EnginePhase;
  public readonly actor: PragmaActor;
  public readonly name: PragmaComponentRegistryKeys;
  private isComponentEnabled: boolean = true;

  constructor(internal: InternalPCProps) {
    this.actor = internal.actor;
    this.name = internal.componentName;
    let mask = EnginePhase.none;
    if (this.fixedUpdate) mask |= EnginePhase.fixedUpdate;
    if (this.preUpdate) mask |= EnginePhase.preUpdate;
    if (this.update) mask |= EnginePhase.update;
    if (this.postUpdate) mask |= EnginePhase.postUpdate;
    if (this.render) mask |= EnginePhase.render;
    this.phases = mask;
  }
  public destroySelf() {
    this.actor.destroyComponent(this.name);
  }
  public getSibling(name: PragmaComponentRegistryKeys) {
    return this.actor.getComponent(name);
  }
  public getScene() {
    return this.actor.scene;
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
}

interface PragmaComponent {
  awake?(): void;
  start?(): void;
  destroy?(): void;
  fixedUpdate?(): void;
  preUpdate?(): void;
  update?(): void;
  postUpdate?(): void;
  render?(): void;
}

export default PragmaComponent;
