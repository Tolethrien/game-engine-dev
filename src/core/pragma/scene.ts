import PragmaActor from "./actor";
import { EventBus } from "./eventManager";

interface SceneProps {
  sceneName: string;
  active?: boolean;
}
export default class PragmaScene {
  private sceneName: string;
  public active: boolean;
  private actorsInScene: Map<Symbol, PragmaActor> = new Map();
  public actorsDirty: Set<PragmaActor> = new Set();
  public readonly actorsWithFixedUpdate: Set<PragmaActor> = new Set();
  public readonly actorsWithPreUpdate: Set<PragmaActor> = new Set();
  public readonly actorsWithUpdate: Set<PragmaActor> = new Set();
  public readonly actorsWithPostUpdate: Set<PragmaActor> = new Set();
  public readonly actorsWithRender: Set<PragmaActor> = new Set();
  public readonly actorsToAdd: Set<PragmaActor> = new Set();
  public readonly actorsToRemove: Set<PragmaActor> = new Set();
  public readonly events = new EventBus();
  constructor(props: SceneProps) {
    this.sceneName = props.sceneName;
    this.active = props.active ?? true;
  }
  public get getAllActors() {
    return this.actorsInScene.values();
  }
  public get getName() {
    return this.sceneName;
  }

  public update() {
    for (const actor of this.actorsToAdd) {
      this.actorsInScene.set(actor.ID, actor);
      actor.onAwake();
    }
    for (const actor of this.actorsToAdd) {
      actor.onStart();
    }
    this.actorsToAdd.clear();
    for (const actor of this.actorsToRemove) {
      actor.onDestroy();
      this.actorsInScene.delete(actor.ID);
    }
    this.actorsToRemove.clear();
    for (const actor of this.actorsDirty) actor.resolvePending();
    for (const actor of this.actorsDirty) actor.startPending();
    this.actorsDirty.clear();

    for (const actor of this.actorsWithPreUpdate) {
      if (!actor.getEnabled()) continue;
      for (const component of actor.phaseRegistrator.preUpdate) {
        if (!component.getEnabled()) continue;
        component.preUpdate!();
      }
    }
    for (const actor of this.actorsWithFixedUpdate) {
      if (!actor.getEnabled()) continue;
      for (const component of actor.phaseRegistrator.fixedUpdate) {
        if (!component.getEnabled()) continue;
        component.fixedUpdate!();
      }
    }

    for (const actor of this.actorsWithUpdate) {
      if (!actor.getEnabled()) continue;
      for (const component of actor.phaseRegistrator.update) {
        if (!component.getEnabled()) continue;
        component.update!();
      }
    }

    for (const actor of this.actorsWithPostUpdate) {
      if (!actor.getEnabled()) continue;
      for (const component of actor.phaseRegistrator.postUpdate) {
        if (!component.getEnabled()) continue;
        component.postUpdate!();
      }
    }

    for (const actor of this.actorsWithRender) {
      if (!actor.getEnabled() || !actor.getVisibility()) continue;
      for (const component of actor.phaseRegistrator.render) {
        if (!component.getEnabled()) continue;
        component.render!();
      }
    }
  }
  public spawnActor(actor: PragmaActor) {
    actor.scene = this;
    this.actorsToAdd.add(actor);
  }
  public deleteActor(actor: PragmaActor) {
    this.actorsToRemove.add(actor);
  }
}
