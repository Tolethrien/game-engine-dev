import { dogmaConfig } from "@sandbox/configs";
import DogmaComponent from "./component";
import DogmaSystem, { InternalDSProps } from "./system";
import { assert } from "@/utils/utils";
import DogmaEntity from "./entity";
export interface DogmaSceneFlags {
  isActive: boolean;
  isRendered: boolean;
  isFocused: boolean;
  priority: number;
}
interface PhaseEntry {
  phaseName: DogmaPhase;
  systemName: SystemRegistryKeys;
  callback: () => void;
  sysRef: DogmaSystem;
  before: Set<SystemRegistryKeys>;
  after: Set<SystemRegistryKeys>;
}
export type PartialDSFlags = Partial<DogmaSceneFlags>;
export default class DogmaScene {
  private components: Map<string, Map<Symbol, DogmaComponent>> = new Map();
  private systems: Map<string, DogmaSystem> = new Map();
  public componentsToDispatch: Set<DogmaComponent> = new Set();
  public componentsToRemove: Set<DogmaEntity["ID"]> = new Set();
  public systemsToDispatch: Map<string, DogmaSystem> = new Map();
  public systemsToRemove: Set<SystemRegistryKeys> = new Set();
  public phaseToDispatch: PhaseEntry[] = [];
  public phaseToRemove: Omit<PhaseEntry, "before" | "after">[] = [];
  private sceneName: string;
  private sceneFlags: DogmaSceneFlags = {
    isActive: true,
    isRendered: true,
    isFocused: true,
    priority: 0,
  };
  private phaseManager: Record<DogmaPhase, PhaseEntry[]> = {
    fixedUpdate: [],
    postUpdate: [],
    preUpdate: [],
    render: [],
    update: [],
  };
  public constructor(name: string, flags?: PartialDSFlags) {
    this.sceneName = name;
    this.sceneFlags = { ...this.sceneFlags, ...flags };
  }
  public getName() {
    return this.sceneName;
  }
  public getFlags() {
    return this.sceneFlags;
  }
  public setFlag(flags: PartialDSFlags) {
    this.sceneFlags = { ...this.sceneFlags, ...flags };
  }

  public addSystem<T extends SystemRegistryKeys>(name: T) {
    assert(
      !this.systems.has(name) && !this.systemsToDispatch.has(name),
      `Trying to add multiple instance of System: ${name} to scene: ${this.sceneName}`,
    );
    const internal: InternalDSProps = {
      scene: this,
      systemName: name,
    };
    const instance = new (dogmaConfig.systems[name] as new (
      ...args: unknown[]
    ) => DogmaSystem)(internal);
    this.systemsToDispatch.set(name, instance);
  }
  public removeSystem<T extends SystemRegistryKeys>(name: T) {
    this.systemsToRemove.add(name);
  }
  public addToScenePhase(phaseEntry: PhaseEntry) {
    this.validatePhaseConstraints(phaseEntry);
    this.phaseToDispatch.push(phaseEntry);
  }

  public removeFromScenePhase(
    phaseEntry: Omit<PhaseEntry, "before" | "after">,
  ) {
    //TODO: nie musze tutaj polowy przekazywac, szkoda pracy
    this.phaseToRemove.push(phaseEntry);
  }
  public getPhaseSubscribers(phase: DogmaPhase) {
    return this.phaseManager[phase];
  }

  public entityDispatcher() {
    if (this.componentsToDispatch.size !== 0) {
      this.componentsToDispatch.forEach((component) => {
        const name = component.componentName;
        let list = this.components.get(name);
        if (!list) {
          list = new Map();
          this.components.set(name, list);
        }
        list.set(component.ID, component);
      });
      this.componentsToDispatch.clear();
    }

    if (this.componentsToRemove.size !== 0) {
      this.componentsToRemove.forEach((ID) => {
        this.components.forEach((list) => {
          const component = list.get(ID);
          if (!component) return;
          list.delete(component.ID);
          if (list.size === 0) this.components.delete(component.componentName);
        });
      });
      this.componentsToRemove.clear();
    }
  }
  public systemDispatcher() {
    let needSorting = false;
    //AddSystems and fire oStart()
    if (this.systemsToDispatch.size !== 0) {
      this.systemsToDispatch.forEach((system, name) => {
        this.systems.set(name, system);
      });
      this.systemsToDispatch.forEach((system) => system.onStart());
      this.systemsToDispatch.clear();
    }
    //Add Phases
    if (this.phaseToDispatch.length !== 0) {
      needSorting = true;
      this.phaseToDispatch.forEach((entry) =>
        this.phaseManager[entry.phaseName].push(entry),
      );
      this.phaseToDispatch.length = 0;
    }
    //Remove Phases
    if (this.phaseToRemove.length !== 0) {
      needSorting = true;
      this.phaseToRemove.forEach((entry) => {
        const subscribers = this.phaseManager[entry.phaseName];
        for (let i = subscribers.length - 1; i >= 0; i--) {
          if (
            subscribers[i].systemName === entry.systemName &&
            subscribers[i].callback === entry.callback
          )
            subscribers.splice(i, 1);
        }
      });
      this.phaseToRemove.length = 0;
    }
    //remove systems and phases if left
    if (this.systemsToRemove.size !== 0) {
      this.systemsToRemove.forEach((name) => {
        const system = this.systems.get(name);
        if (!system) return;
        system.onDestroy();
        (Object.keys(this.phaseManager) as DogmaPhase[]).forEach((phase) => {
          const subscribers = this.phaseManager[phase];

          for (let i = subscribers.length - 1; i >= 0; i--) {
            if (subscribers[i].systemName === name) {
              subscribers.splice(i, 1);
              needSorting = true;
            }
          }
        });
        this.systems.delete(name);
      });
      this.systemsToRemove.clear();
    }
    // Topological DAG sort
    if (needSorting) {
      (Object.keys(this.phaseManager) as DogmaPhase[]).forEach((phase) => {
        this.sortPhaseByDependencies(this.phaseManager[phase]);
      });
    }
  }
  //AI
  private sortPhaseByDependencies(entries: PhaseEntry[]) {
    const inDegree = new Map<number, number>();
    const adjacencyList = new Map<number, Set<number>>();

    entries.forEach((_, idx) => {
      inDegree.set(idx, 0);
      adjacencyList.set(idx, new Set());
    });

    entries.forEach((entry, idx) => {
      entries.forEach((other, otherIdx) => {
        if (idx === otherIdx) return;

        if (entry.before.has(other.systemName)) {
          adjacencyList.get(idx)!.add(otherIdx);
          const degree = inDegree.get(otherIdx)!;
          inDegree.set(otherIdx, degree + 1);
        }

        if (entry.after.has(other.systemName)) {
          adjacencyList.get(otherIdx)!.add(idx);
          const degree = inDegree.get(idx)!;
          inDegree.set(idx, degree + 1);
        }
      });
    });

    const queue: number[] = [];
    inDegree.forEach((degree, idx) => {
      if (degree === 0) queue.push(idx);
    });

    const sorted: PhaseEntry[] = [];
    while (queue.length > 0) {
      const idx = queue.shift()!;
      sorted.push(entries[idx]);

      adjacencyList.get(idx)!.forEach((neighbor) => {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    if (sorted.length !== entries.length) {
      const remaining = new Set<number>();
      inDegree.forEach((degree, idx) => {
        if (degree > 0) remaining.add(idx);
      });
      const cycleNames = Array.from(remaining)
        .map((idx) => entries[idx].systemName)
        .join(", ");
      throw new Error(
        `Phase Sorting: Circular Detected. Cannot resolve. Systems involved: ${cycleNames}`,
      );
    }

    entries.length = 0;
    sorted.forEach((entry) => entries.push(entry));
  }
  //AI
  private validatePhaseConstraints(entry: PhaseEntry): void {
    if (entry.before.has(entry.systemName))
      throw new Error(`${entry.systemName} cannot be in its own "before" list`);

    if (entry.after.has(entry.systemName))
      throw new Error(`${entry.systemName} cannot be in its own "after" list`);

    const conflict = Array.from(entry.before).filter((sys) =>
      entry.after.has(sys),
    );
    if (conflict.length > 0)
      throw new Error(
        `Paradox: ${entry.systemName} is both before AND after: ${conflict.join(", ")}`,
      );
  }

  public getComponentList(name: string) {
    return this.components.get(name);
  }
  public getAllComponents() {
    return this.components;
  }
  public getAllSystems() {
    return this.systems;
  }
  public getSystem(name: SystemRegistryKeys) {
    return this.systems.get(name);
  }
}
