import { dogmaConfig } from "@sandbox/configs";
import DogmaComponent from "./component";
import DogmaSystem, { InternalDSProps } from "./system";
import { assert } from "@/utils/utils";
import DogmaEntity from "./entity";
import { SharedData } from "./dogma";
import EventManager, { EventData } from "./eventManager";
export interface DogmaSceneFlags {
  isActive: boolean;
  isRendered: boolean;
  priority: number;
}
// interface DeferredSubscriber {
//   callback: (data: EventData) => void;
//   after?: SystemRegistryKeys[];
//   before?: SystemRegistryKeys[];
// }
interface PhaseEntry {
  phaseName: DogmaPhase;
  systemName: SystemRegistryKeys;
  callback: () => void;
  sysRef: DogmaSystem;
  before: Set<SystemRegistryKeys>;
  after: Set<SystemRegistryKeys>;
}
interface PhaseRemoveEntry {
  phaseName: DogmaPhase;
  systemName: SystemRegistryKeys;
}
export type PartialDSFlags = Partial<DogmaSceneFlags>;
export default class DogmaScene {
  private readonly components: Map<string, Map<Symbol, DogmaComponent>> =
    new Map();
  private readonly systems: Map<string, DogmaSystem> = new Map();
  public readonly entityToDispatch: Set<DogmaEntity> = new Set();
  public readonly entityToRemove: Set<DogmaEntity["ID"]> = new Set();
  public readonly systemsToDispatch: Map<string, DogmaSystem> = new Map();
  public readonly systemsToRemove: Set<SystemRegistryKeys> = new Set();
  public readonly phaseToDispatch: PhaseEntry[] = [];
  public readonly phaseToRemove: PhaseRemoveEntry[] = [];
  private readonly sceneName: string;
  public readonly sceneSharedData: Map<string, SharedData> = new Map();
  public readonly eventManager: EventManager;

  private readonly queries: Map<string, Set<Symbol>> = new Map();
  private readonly queryFilters: Map<string, ComponentRegistryKeys[]> =
    new Map();
  private readonly markerQuery: Map<string, Symbol> = new Map();
  private readonly markerMap: Map<Symbol, string> = new Map();
  private readonly tagsQuery: Map<string, Set<Symbol>> = new Map();
  private readonly tagsQueryFilter: Map<string, Set<string>> = new Map();

  public readonly entitiesInFrame = {
    addedToFrame: new Set<Symbol>(),
    removedFromFrame: new Set<Symbol>(),
    inFrame: new Set<Symbol>(),
  };

  private sceneFlags: DogmaSceneFlags = {
    isActive: true,
    isRendered: true,
    priority: 0,
  };
  private phaseManager: Record<DogmaPhase, PhaseEntry[]> = {
    fixedUpdate: [],
    postUpdate: [],
    preUpdate: [],
    render: [],
    update: [],
    eventsDeferred: [],
  };
  public constructor(name: string, flags?: PartialDSFlags) {
    this.sceneName = name;
    this.sceneFlags = { ...this.sceneFlags, ...flags };
    this.eventManager = new EventManager(this);
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
  public getPhaseSubscribers(phase: DogmaPhase) {
    return this.phaseManager[phase];
  }
  public getQueryResult(key: string) {
    return this.queries.get(key);
  }
  public getMarkerQuery(marker: string) {
    return this.markerQuery.get(marker);
  }
  public createQuery(key: string, list: ComponentRegistryKeys[]) {
    const results = new Set<Symbol>();

    this.queries.set(key, results);
    this.queryFilters.set(key, list);

    if (list.length === 0) return results;

    const componentMaps: Map<Symbol, DogmaComponent>[] = [];
    for (const name of list) {
      const ComponentList = this.components.get(name);
      if (!ComponentList) return results;
      componentMaps.push(ComponentList);
    }

    const firstComponentMap = componentMaps[0];
    for (const [id] of firstComponentMap) {
      let hasAll = true;
      for (let i = 1; i < componentMaps.length; i++) {
        if (!componentMaps[i].has(id)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) {
        results.add(id);
      }
    }
    return results;
  }
  public getTagsQueryResults(key: string) {
    return this.tagsQuery.get(key);
  }
  public createTagsQuery(
    key: string,
    tags: string[],
    component: ComponentRegistryKeys,
  ) {
    const results = new Set<Symbol>();
    const tagsSet = new Set(tags);
    this.tagsQuery.set(key, results);
    tags.forEach((tag) => {
      const list = this.tagsQueryFilter.get(tag);
      if (list) list.add(key);
      else this.tagsQueryFilter.set(tag, new Set<string>().add(key));
    });
    const list = this.components.get(component);
    if (!list || tags.length === 0) return results;
    list.forEach((comp, ID) => {
      if (tagsSet.isSubsetOf(comp.tags)) results.add(ID);
    });
    return results;
  }
  public updateTagsQuery(tag: string, component: DogmaComponent) {
    const list = this.tagsQueryFilter.get(tag);
    if (!list) return;

    list.forEach((tagQueryKey) => {
      const query = this.tagsQuery.get(tagQueryKey);
      if (!query) return;

      const requiredTags = tagQueryKey.split("|");
      const requiredTagsSet = new Set(requiredTags);

      const hasAllTags = requiredTagsSet.isSubsetOf(component.tags);

      if (hasAllTags) query.add(component.ID);
      else query.delete(component.ID);
    });
  }

  public addSystem<T extends SystemRegistryKeys>(name: T) {
    assert(
      !this.systems.has(name) && !this.systemsToDispatch.has(name),
      `Trying to add multiple instance of System: ${name} to scene: ${this.sceneName}`,
    );
    const internalProps: InternalDSProps = {
      scene: this,
      systemName: name,
    };
    const system = new (dogmaConfig.systems[name] as new (
      ...args: unknown[]
    ) => DogmaSystem)(internalProps);
    this.systemsToDispatch.set(name, system);
  }
  public removeSystem<T extends SystemRegistryKeys>(name: T) {
    this.systemsToRemove.add(name);
  }
  public addToScenePhase(phaseEntry: PhaseEntry) {
    this.validatePhaseConstraints(phaseEntry);
    this.phaseToDispatch.push(phaseEntry);
  }

  public removeFromScenePhase(entry: PhaseRemoveEntry) {
    this.phaseToRemove.push(entry);
  }
  /**@description subscribe function to a deferred events phase. Note! callback need to be "()=>callback()" or callback.bind(this) */
  public addToDeferred(entry: PhaseEntry) {
    this.validatePhaseConstraints(entry);
    this.phaseToDispatch.push(entry);
  }

  /**@description unsubscribe function from a deferred events phase. */
  public removeFromDeferred(entry: PhaseRemoveEntry) {
    this.phaseToRemove.push(entry);
  }

  public entityDispatcher() {
    this.entitiesInFrame.addedToFrame.clear();
    this.entitiesInFrame.removedFromFrame.clear();
    if (this.entityToDispatch.size !== 0) this.dispatchEntities();
    if (this.entityToRemove.size !== 0) this.removeEntities();
  }
  private dispatchEntities() {
    this.entityToDispatch.forEach((ent) => {
      this.entitiesInFrame.inFrame.add(ent.ID);
      this.entitiesInFrame.addedToFrame.add(ent.ID);
      const marker = ent.getMarker();
      if (marker !== "") {
        this.markerQuery.set(marker, ent.ID);
        this.markerMap.set(ent.ID, marker);
      }
      const tags = ent.getTags();
      const key = Array.from(tags).sort().join("|");
      const tagCache = this.tagsQuery.get(key);
      if (tagCache) tagCache.add(ent.ID);

      const components = ent.getComponents();
      components.forEach((component, name) => {
        let list = this.components.get(name);
        if (!list) {
          list = new Map();
          this.components.set(name, list);
        }
        list.set(component.ID, component);
      });
      this.queries.forEach((querySet, queryKey) => {
        const requiredComponents = this.queryFilters.get(queryKey)!;
        let hasAll = true;

        for (const compName of requiredComponents) {
          const list = this.components.get(compName);
          if (!list || !list.has(ent.ID)) {
            hasAll = false;
            break;
          }
        }
        if (hasAll) querySet.add(ent.ID);
      });
    });
    this.entityToDispatch.clear();
  }
  private removeEntities() {
    this.entityToRemove.forEach((ID) => {
      this.entitiesInFrame.removedFromFrame.add(ID);
      this.entitiesInFrame.inFrame.delete(ID);
      const marker = this.markerMap.get(ID);
      if (marker) {
        this.markerMap.delete(ID);
        this.markerQuery.delete(marker);
      }
      this.tagsQuery.forEach((query) => query.delete(ID));
      this.components.forEach((list) => {
        const component = list.get(ID);
        if (!component) return;
        list.delete(component.ID);
        if (list.size === 0) this.components.delete(component.componentName);
      });
      this.queries.forEach((querySet) => {
        querySet.delete(ID);
      });
    });
    this.entityToRemove.clear();
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
          if (subscribers[i].systemName !== entry.systemName) continue;
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

    entries.forEach((_, index) => {
      inDegree.set(index, 0);
      adjacencyList.set(index, new Set());
    });

    entries.forEach((entry, index) => {
      entries.forEach((other, otherIndex) => {
        if (index === otherIndex) return;
        if (entry.before.has(other.systemName)) {
          const neighbors = adjacencyList.get(index)!;
          if (!neighbors.has(otherIndex)) {
            neighbors.add(otherIndex);
            inDegree.set(otherIndex, inDegree.get(otherIndex)! + 1);
          }
        }
        if (entry.after.has(other.systemName)) {
          const otherNeighbors = adjacencyList.get(otherIndex)!;
          if (!otherNeighbors.has(index)) {
            otherNeighbors.add(index);
            inDegree.set(index, inDegree.get(index)! + 1);
          }
        }
      });
    });
    const queue: number[] = [];
    inDegree.forEach((degree, index) => {
      if (degree === 0) queue.push(index);
    });

    const sorted: PhaseEntry[] = [];
    while (queue.length > 0) {
      const index = queue.shift()!;
      sorted.push(entries[index]);

      adjacencyList.get(index)!.forEach((neighbor) => {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    if (sorted.length !== entries.length) {
      const remaining = new Set<number>();
      inDegree.forEach((degree, index) => {
        if (degree > 0) remaining.add(index);
      });
      const cycleNames = Array.from(remaining)
        .map((index) => entries[index].systemName)
        .join(", ");
      throw new Error(
        `Phase Sorting: Circular Detected. Cannot resolve. Systems involved: ${cycleNames}`,
      );
    }

    entries.length = 0;
    sorted.forEach((entry) => entries.push(entry));
  }
  //AI
  private validatePhaseConstraints(entry: PhaseEntry) {
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
}
