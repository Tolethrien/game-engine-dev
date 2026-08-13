import { assert } from "@/utils/utils";
import PragmaComponent, { InternalPCProps } from "./component";
import { pragmaConfig } from "@/sandbox/configs";
import PragmaScene from "./scene";
import { EnginePhase } from "./pragma";
import { EventBus } from "./eventManager";

export default abstract class PragmaActor {
  public readonly ID: Symbol;
  private components = new Map<PragmaComponentRegistryKeys, PragmaComponent>();
  public readonly tags: Set<string> = new Set();
  private marker: string | undefined = undefined;
  private isVisible: boolean = true;
  private isEnabled: boolean = true;
  private isLive: boolean = false;
  private pendingToAdd: Set<PragmaComponent> = new Set();
  private pendingToRemove: Set<PragmaComponent> = new Set();
  declare public scene: PragmaScene;
  public events = new EventBus();
  public phaseRegistrator: PragmaPhaseRegistry = {
    fixedUpdate: new Set(),
    preUpdate: new Set(),
    update: new Set(),
    postUpdate: new Set(),
    render: new Set(),
  };

  constructor() {
    this.ID = Symbol(crypto.randomUUID());
    this.addComponent("Transform");
  }
  public addComponent<T extends PragmaComponentRegistryKeys>(
    name: T,
    ...args: DropFirst<ConstructorParameters<PragmaComponentRegistry[T]>>
  ) {
    assert(
      !this.components.has(name),
      `Trying to add multiple instance of Component: ${name} to Actor: ${this.constructor.name}, ID:${this.ID.description}`,
    );
    const internalProps: InternalPCProps = {
      actor: this,
      componentName: name,
    };

    const component = new (pragmaConfig.components[name] as new (
      ...args: unknown[]
    ) => PragmaComponent)(internalProps, ...args);

    if (this.isLive) {
      this.scene.actorsDirty.add(this);
      this.pendingToAdd.add(component);
    } else this.addToLocalPhases(component);

    this.components.set(name, component);
  }
  public destroyComponent(name: PragmaComponentRegistryKeys) {
    assert(name !== "Transform", `cannot remove Transform.`);
    const component = this.components.get(name);
    if (!component) {
      console.warn(
        `there in no component with name: ${name} in actor: ${this.ID}`,
      );
      return;
    }
    this.components.delete(name);
    if (this.isLive) {
      this.scene.actorsDirty.add(this);
      this.pendingToRemove.add(component);
    } else this.deleteFromLocalPhases(component);
  }
  public getComponent<T extends PragmaComponentRegistryKeys>(name: T) {
    return this.components.get(name) as
      | InstanceType<PragmaComponentRegistry[T]>
      | undefined;
  }
  public hasComponent(name: PragmaComponentRegistryKeys) {
    return this.components.has(name);
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
    if (this.phaseRegistrator.fixedUpdate.size > 0)
      this.scene.actorsWithFixedUpdate.add(this);
    if (this.phaseRegistrator.preUpdate.size > 0)
      this.scene.actorsWithPreUpdate.add(this);
    if (this.phaseRegistrator.update.size > 0)
      this.scene.actorsWithUpdate.add(this);
    if (this.phaseRegistrator.postUpdate.size > 0)
      this.scene.actorsWithPostUpdate.add(this);
    if (this.phaseRegistrator.render.size > 0)
      this.scene.actorsWithRender.add(this);
    this.components.forEach((component) => component.awake?.());
    this.isLive = true;
  }
  public onStart() {
    this.components.forEach((component) => component.start?.());
  }
  public onDestroy() {
    this.components.forEach((component) => component.destroy?.());
    this.isLive = false;
  }
  private deleteFromLocalPhases(component: PragmaComponent) {
    this.phaseRegistrator.fixedUpdate.delete(component);
    this.phaseRegistrator.preUpdate.delete(component);
    this.phaseRegistrator.update.delete(component);
    this.phaseRegistrator.postUpdate.delete(component);
    this.phaseRegistrator.render.delete(component);
  }
  private addToLocalPhases(component: PragmaComponent) {
    if (component.phases & EnginePhase.fixedUpdate)
      this.phaseRegistrator.fixedUpdate.add(component);
    if (component.phases & EnginePhase.preUpdate)
      this.phaseRegistrator.preUpdate.add(component);
    if (component.phases & EnginePhase.update)
      this.phaseRegistrator.update.add(component);
    if (component.phases & EnginePhase.postUpdate)
      this.phaseRegistrator.postUpdate.add(component);
    if (component.phases & EnginePhase.render)
      this.phaseRegistrator.render.add(component);
  }
  private updateScenePhases() {
    //TODO: to sie da ujednolisci nazwowo by zrobic loopa
    const preList = this.scene.actorsWithPreUpdate;
    this.phaseRegistrator.preUpdate.size > 0
      ? preList.add(this)
      : preList.delete(this);

    const fixedList = this.scene.actorsWithFixedUpdate;
    this.phaseRegistrator.fixedUpdate.size > 0
      ? fixedList.add(this)
      : fixedList.delete(this);

    const updateList = this.scene.actorsWithUpdate;
    this.phaseRegistrator.update.size > 0
      ? updateList.add(this)
      : updateList.delete(this);

    const postList = this.scene.actorsWithPostUpdate;
    this.phaseRegistrator.postUpdate.size > 0
      ? postList.add(this)
      : postList.delete(this);

    const renderList = this.scene.actorsWithRender;
    this.phaseRegistrator.render.size > 0
      ? renderList.add(this)
      : renderList.delete(this);
  }
}
