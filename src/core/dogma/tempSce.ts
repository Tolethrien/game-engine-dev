import { dogmaConfig } from "@sandbox/configs";
import DogmaComponent from "./component";
import DogmaSystem, { InternalDSProps } from "./system";
import { assert } from "@/utils/utils";
import DogmaEntity from "./entity";
import { SharedData } from "./dogma";
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
interface PhaseRemoveEntry {
  phaseName: DogmaPhase;
  systemName: SystemRegistryKeys;
  sysRef: DogmaSystem;
}
export type PartialDSFlags = Partial<DogmaSceneFlags>;
export default class DogmaScene {
  private components: Map<string, Map<Symbol, DogmaComponent>> = new Map();
  private systems: Map<string, DogmaSystem> = new Map();
  public entityToDispatch: Set<DogmaEntity> = new Set();
  public entityToRemove: Set<DogmaEntity["ID"]> = new Set();
  public systemsToDispatch: Map<string, DogmaSystem> = new Map();
  public systemsToRemove: Set<SystemRegistryKeys> = new Set();
  public phaseToDispatch: PhaseEntry[] = [];
  public phaseToRemove: PhaseRemoveEntry[] = [];
  private sceneName: string;
  public readonly sceneSharedData: Map<string, SharedData> = new Map();
  private readonly queries: Map<string, Set<Symbol>> = new Map();
  private readonly queryFilters: Map<string, ComponentRegistryKeys[]> =
    new Map();
  public readonly markerQuery: Map<string, Symbol> = new Map();
  public readonly markerMap: Map<Symbol, string> = new Map();

  public readonly entitiesInFrame = {
    addedToFrame: new Set<Symbol>(),
    removedFromFrame: new Set<Symbol>(),
    inFrame: new Set<Symbol>(),
  };
  private tagIndex: Map<string, Set<Symbol>> = new Map();
  private tagQueryCache: Map<string, Set<Symbol>> = new Map();

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
  public getPhaseSubscribers(phase: DogmaPhase) {
    return this.phaseManager[phase];
  }
  public getQueryResult(key: string) {
    return this.queries.get(key);
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

  public removeFromScenePhase(entry: PhaseRemoveEntry) {
    this.phaseToRemove.push(entry);
  }
  public entityDispatcher() {
    this.entitiesInFrame.addedToFrame.clear();
    this.entitiesInFrame.removedFromFrame.clear();
    if (this.entityToDispatch.size !== 0) {
      this.entityToDispatch.forEach((ent) => {
        this.entitiesInFrame.inFrame.add(ent.ID);
        this.entitiesInFrame.addedToFrame.add(ent.ID);
        const marker = ent.getMarker();
        if (marker !== "") {
          this.markerQuery.set(marker, ent.ID);
          this.markerMap.set(ent.ID, marker);
        }
        const components = ent.getComponents();
        // collect tags from components (components of same entity share tag set)
        const collectedTags = new Set<string>();
        components.forEach((component) => {
          component.tags.forEach((t) => collectedTags.add(t));
        });

        // update tagIndex and invalidate caches referencing these tags
        collectedTags.forEach((t) => {
          let set = this.tagIndex.get(t);
          if (!set) {
            set = new Set();
            this.tagIndex.set(t, set);
          }
          set.add(ent.ID);
          // invalidate cache entries that include this tag
          for (const key of Array.from(this.tagQueryCache.keys())) {
            if (key.split("|").includes(t)) this.tagQueryCache.delete(key);
          }
        });

        components.forEach((component, name) => {
          let list = this.components.get(name);
          if (!list) {
            list = new Map();
            this.components.set(name, list);
          }
          list.set(component.ID, component);
        });
      });
      this.entityToDispatch.clear();
    }
    if (this.entityToRemove.size !== 0) {
      this.entityToRemove.forEach((ID) => {
        this.entitiesInFrame.removedFromFrame.add(ID);
        this.entitiesInFrame.inFrame.delete(ID);
        const marker = this.markerMap.get(ID);
        if (marker) {
          this.markerMap.delete(ID);
          this.markerQuery.delete(marker);
        }
        // remove ID from tagIndex and invalidate caches for affected tags
        for (const [tag, set] of Array.from(this.tagIndex.entries())) {
          if (set.has(ID)) {
            set.delete(ID);
            if (set.size === 0) this.tagIndex.delete(tag);
            for (const key of Array.from(this.tagQueryCache.keys())) {
              if (key.split("|").includes(tag)) this.tagQueryCache.delete(key);
            }
          }
        }

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
    if (this.entitiesInFrame.addedToFrame.size === 0 || this.queries.size === 0)
      return;
    this.queries.forEach((querySet, key) => {
      const requiredComponents = this.queryFilters.get(key)!;
      this.entitiesInFrame.addedToFrame.forEach((id) => {
        let hasAll = true;
        for (const compName of requiredComponents) {
          const list = this.components.get(compName);
          if (!list || !list.has(id)) {
            hasAll = false;
            break;
          }
        }
        if (hasAll) querySet.add(id);
        else querySet.delete(id);
      });
    });
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

  /**
   * Return array of entity IDs that have all provided tags.
   * Caches results per unique sorted tag list.
   */
  public getEntitiesByTags(tags: string[]): Symbol[] {
    if (tags.length === 0) return Array.from(this.entitiesInFrame.inFrame);
    const key = tags.slice().sort().join("|");
    const cached = this.tagQueryCache.get(key);
    if (cached) return Array.from(cached);
    console.log("nie mam cachu!");
    let result: Set<Symbol> | null = null;
    for (const t of tags) {
      const s = this.tagIndex.get(t);
      if (!s) {
        this.tagQueryCache.set(key, new Set());
        return [];
      }
      if (result === null) result = new Set(s);
      else {
        for (const id of Array.from(result)) {
          if (!s.has(id)) result.delete(id);
        }
        if (result.size === 0) break;
      }
    }
    const finalSet = result ?? new Set<Symbol>();
    this.tagQueryCache.set(key, new Set(finalSet));
    return Array.from(finalSet);
  }

  /**
   * Return array of entity IDs that have the given component AND all provided tags.
   */
  public getComponentsByTags(
    componentName: ComponentRegistryKeys,
    tags: string[],
  ): Symbol[] {
    const ids = this.getEntitiesByTags(tags);
    const compList = this.components.get(componentName);
    if (!compList) return [];
    const res: Symbol[] = [];
    for (const id of ids) if (compList.has(id)) res.push(id);
    return res;
  }

  /**
   * Notify scene that an entity's tag set changed. This will update tagIndex and invalidate caches.
   */
  public notifyEntityTagChange(ID: Symbol, tags: Set<string>) {
    const prevTags = new Set<string>();
    for (const [tag, set] of this.tagIndex) if (set.has(ID)) prevTags.add(tag);

    // add new tags
    for (const t of tags) {
      if (!prevTags.has(t)) {
        let s = this.tagIndex.get(t);
        if (!s) {
          s = new Set();
          this.tagIndex.set(t, s);
        }
        s.add(ID);
        for (const key of Array.from(this.tagQueryCache.keys())) {
          if (key.split("|").includes(t)) this.tagQueryCache.delete(key);
        }
      }
    }

    // remove tags that are no longer present
    for (const t of prevTags) {
      if (!tags.has(t)) {
        const s = this.tagIndex.get(t);
        if (!s) continue;
        s.delete(ID);
        if (s.size === 0) this.tagIndex.delete(t);
        for (const key of Array.from(this.tagQueryCache.keys())) {
          if (key.split("|").includes(t)) this.tagQueryCache.delete(key);
        }
      }
    }
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
