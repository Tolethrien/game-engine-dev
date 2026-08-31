import { assert } from "@/utils/utils";
import PragmaComponent from "./component";
import Transform from "@/sandbox/components/transform";
import PragmaScene from "./scene";
import Pragma, { EnginePhase, ITERATED_PHASES } from "./pragma";
import { EventBus } from "./eventManager";

export default abstract class PragmaActor {
  public readonly ID: Symbol;
  private components = new Map<PragmaComponentClass, PragmaComponent>();
  public readonly tags: Set<string> = new Set();
  private marker: string | undefined = undefined;
  private isVisible: boolean = true;
  private isEnabled: boolean = true;
  private isLive: boolean = false;
  private pendingToAdd: Set<PragmaComponent> = new Set();
  private pendingToRemove: Set<PragmaComponent> = new Set();
  declare public scene: PragmaScene;
  public events = new EventBus();
  public phaseRegistrator: PragmaPhaseRegistry = Object.fromEntries(
    ITERATED_PHASES.map((phase) => [phase, new Set<PragmaComponent>()]),
  ) as PragmaPhaseRegistry;

  constructor() {
    this.ID = Symbol(crypto.randomUUID());
    this.addComponent(Transform);
  }
  public addComponent<T extends PragmaComponentClass>(
    ctor: T,
    ...args: DropFirst<ConstructorParameters<T>>
  ) {
    assert(
      !this.components.has(ctor),
      `Trying to add multiple instance of Component: ${ctor.name} to Actor: ${this.constructor.name}, ID:${this.ID.description}`,
    );
    const component = new ctor({ actor: this }, ...args) as InstanceType<T>;

    if (this.isLive) {
      this.scene.actorsDirty.add(this);
      this.pendingToAdd.add(component);
    } else this.addToLocalPhases(component);

    this.components.set(ctor, component);
    return component;
  }
  public get transform() {
    return this.components.get(Transform)! as Transform;
  }
  public destroyComponent<T extends PragmaComponentClass>(ctor: T) {
    assert(ctor !== (Transform as unknown as T), `cannot remove Transform.`);
    const component = this.components.get(ctor);
    if (!component) {
      console.warn(
        `there in no component with name: ${ctor.name} in actor: ${this.ID}`,
      );
      return;
    }
    this.components.delete(ctor);
    if (this.isLive) {
      this.scene.actorsDirty.add(this);
      this.pendingToRemove.add(component);
    } else this.deleteFromLocalPhases(component);
  }
  public getComponent<T extends PragmaComponentClass>(ctor: T) {
    return this.components.get(ctor) as InstanceType<T> | undefined;
  }
  public hasComponent(ctor: PragmaComponentClass) {
    return this.components.has(ctor);
  }
  public getAllComponents() {
    return this.components.values();
  }
  public setMarker(marker: string) {
    this.marker = marker;
  }
  public getMarker() {
    return this.marker;
  }
  public setVisibility(visible: boolean) {
    this.isVisible = visible;
  }
  public setEnabled(enable: boolean) {
    this.isEnabled = enable;
  }
  public getVisibility() {
    return this.isVisible;
  }
  public getEnabled() {
    return this.isEnabled;
  }
  public resolvePending() {
    for (const component of this.pendingToAdd) {
      this.addToLocalPhases(component);
      component.awake?.();
    }

    for (const component of this.pendingToRemove) {
      this.deleteFromLocalPhases(component);
      component.destroy?.();
    }
    this.pendingToRemove.clear();
    this.updateScenePhases();
  }
  public startPending() {
    for (const component of this.pendingToAdd) component.start?.();
    this.pendingToAdd.clear();
  }
  public onAwake() {
    for (const phase of ITERATED_PHASES) {
      if (this.phaseRegistrator[phase].size > 0) {
        this.scene.actorsWithPhase[phase].add(this);
      }
    }
    this.components.forEach((component) => component.awake?.());
    this.isLive = true;
  }
  public onStart() {
    this.components.forEach((component) => component.start?.());
  }
  public onDestroy() {
    this.components.forEach((component) => component.destroy?.());
    for (const phase of ITERATED_PHASES)
      this.scene.actorsWithPhase[phase].delete(this);
    this.isLive = false;
  }
  private deleteFromLocalPhases(component: PragmaComponent) {
    for (const phase of ITERATED_PHASES) {
      this.phaseRegistrator[phase].delete(component);
    }
  }
  private addToLocalPhases(component: PragmaComponent) {
    for (const phase of ITERATED_PHASES) {
      if (component.phases & EnginePhase[phase]) {
        this.phaseRegistrator[phase].add(component);
      }
    }
  }
  private updateScenePhases() {
    for (const phase of ITERATED_PHASES) {
      const set = this.scene.actorsWithPhase[phase];
      this.phaseRegistrator[phase].size > 0 ? set.add(this) : set.delete(this);
    }
  }
  public selfDestroy() {
    this.scene.deleteActor(this);
  }
}
