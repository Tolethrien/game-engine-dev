import PragmaActor from "./actor";
import { EventBus, SharedData } from "./eventManager";
import { ITERATED_PHASES } from "./pragma";

interface SceneProps {
  sceneName: string;
  active?: boolean;
}
export default class PragmaScene {
  private sceneName: string;
  public active: boolean;
  private actorsInScene: Map<Symbol, PragmaActor> = new Map();
  public actorsDirty: Set<PragmaActor> = new Set();

  public readonly actorsWithPhase: Record<
    IteratedPragmaPhases,
    Set<PragmaActor>
  > = Object.fromEntries(
    ITERATED_PHASES.map((phase) => [phase, new Set<PragmaActor>()]),
  ) as Record<IteratedPragmaPhases, Set<PragmaActor>>;
  public readonly actorsToAdd: Set<PragmaActor> = new Set();
  public readonly actorsToRemove: Set<PragmaActor> = new Set();
  public readonly events = new EventBus();
  public readonly sharedData = new SharedData();
  constructor(props: SceneProps) {
    this.sceneName = props.sceneName;
    this.active = props.active ?? true;
  }
  public get getAllActors() {
    return this.actorsInScene.values();
  }
  public get getActorsCount() {
    return this.actorsInScene.size;
  }
  public get getName() {
    return this.sceneName;
  }

  private runPhase(phase: IteratedPragmaPhases) {
    for (const actor of this.actorsWithPhase[phase]) {
      if (phase !== "render" && !actor.getEnabled()) continue;
      if (phase === "render" && !actor.getVisibility()) continue;
      for (const component of actor.phaseRegistrator[phase]) {
        if (!component.getEnabled()) continue;
        component[phase]!();
      }
    }
  }

  public prePhase() {
    while (this.actorsToAdd.size > 0) {
      const batch = new Set(this.actorsToAdd);
      this.actorsToAdd.clear();

      for (const actor of batch) {
        this.actorsInScene.set(actor.ID, actor);
        actor.onAwake();
      }
      for (const actor of batch) {
        actor.onStart();
      }
    }
    for (const actor of this.actorsToRemove) {
      actor.onDestroy();
      this.actorsInScene.delete(actor.ID);
    }
    this.actorsToRemove.clear();
    for (const actor of this.actorsDirty) actor.resolvePending();
    for (const actor of this.actorsDirty) actor.startPending();
    this.actorsDirty.clear();

    this.runPhase("preUpdate");
  }
  public fixedPhase() {
    this.runPhase("preFixedUpdate");
    this.runPhase("fixedUpdate");
  }
  public postPhase() {
    this.runPhase("update");
    this.runPhase("postUpdate");
    this.runPhase("render");
  }
  public spawnActor(actor: PragmaActor) {
    actor.scene = this;
    this.actorsToAdd.add(actor);
  }
  public deleteActor(actor: PragmaActor) {
    this.actorsToRemove.add(actor);
  }
}
