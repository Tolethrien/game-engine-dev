# Dogma Engine Documentation

## Overview

Dogma is the core engine layer for scene, system, entity and component management. It provides a small ECS-like structure with phase-based system dispatch, scene sorting, and topological ordering for phase subscribers.

## Main concepts

### Dogma

`Dogma` is the static manager for scenes.

- `createScene(name, flags?)` creates a new `DogmaScene` and queues it for registration.
- `deleteScene(name)` marks a scene for removal.
- `getScene(name)` returns a registered or queued scene.
- `tickAll()` executes the engine tick:
  1. `sceneDispatcher()` updates scene list order by `priority`
  2. `systemDispatcher()` on each scene
  3. `entityDispatcher()` on each scene
  4. Runs phase callbacks: `preUpdate`, `fixedUpdate`, `update`, `postUpdate`, `render`

### DogmaScene

`DogmaScene` holds systems, components, and phase subscription state.

#### Scene lifecycle

- `addSystem(name)` queues a new system instance
- `removeSystem(name)` schedules system removal
- `systemDispatcher()`
  - integrates queued systems, phases, and removals
  - runs `onStart()` for newly added systems
  - sorts phase subscribers with topological DAG ordering
- `entityDispatcher()` commits component additions and removals

#### Phase subscribers

A scene maintains `phaseManager` with arrays for each `DogmaPhase`:

- `preUpdate`
- `fixedUpdate`
- `update`
- `postUpdate`
- `render`

Systems can subscribe callbacks to these phases.

### DogmaSystem

A system is any class extending `DogmaSystem`.

#### Core API

- `getComponentList(name)` reads registered components from the scene
- `addToSharedData(name, data)` stores shared system data
- `getFromSharedData(name)` reads shared data
- `deleteFromSharedData(name)` removes shared data
- `setActive(bool)` enables/disables system execution
- `isActive()` returns the current active state
- `subscribeToPhase(subscriber)` registers a callback into a scene phase
- `unSubscribeFromPhase(phase, func)` removes a phase callback

#### Lifecycle hooks

Override these methods in your system class:

- `onFrameStart()`
- `onStart()`
- `onPreUpdate()`
- `onFixedUpdate()`
- `onUpdate()`
- `onPostUpdate()`
- `onRender()`
- `onDestroy()`
- `onFrameEnd()`

### DogmaComponent

Components are lightweight objects created by entities.

- store component state
- use `componentName` and `ID`
- attached to entities and dispatched into scenes

### DogmaEntity

`DogmaEntity` is a container for components.

- `addComponent(name, ...args)` constructs a component from `dogmaConfig.components`
- `addTag(tag)` adds a tag to the entity
- `getComponents()` returns the component map

### EntityManager

Utility for entity lifecycle within scenes.

- `spawnEntity(ent, sceneName)` registers entity components with a scene
- `removeEntity(entID, sceneName)` marks entity removal by ID

## Phases and ordering

Dogma supports phase-based dispatch and dependency ordering inside a phase.

### Phase subscriber model

Systems register callbacks with:

- `phase` - one of `preUpdate`, `fixedUpdate`, `update`, `postUpdate`, `render`
- `callback()` - the function to execute
- `after?: SystemRegistryKeys[]` - this system must run after listed systems
- `before?: SystemRegistryKeys[]` - this system must run before listed systems

This is managed internally by `addToScenePhase()`.

### Sorting logic

During `systemDispatcher()`, `DogmaScene` performs a topological sort for each phase when subscriptions are added or removed.

#### Dependency rules

- `before: [A]` means current system must run before system `A`
- `after: [A]` means current system must run after system `A`

The engine validates constraints and throws errors when:

- a system references itself in `before` or `after`
- a system is declared both `before` and `after` the same target
- there is a circular dependency in the phase graph

### Error handling

If phase constraints cannot be resolved, the engine throws:

- `cannot be in its own "before" list`
- `cannot be in its own "after" list`
- `PARADOX DETECTED - ... is both before AND after`
- `CIRCULAR DEPENDENCY DETECTED - Cannot resolve order`

## How to use Dogma

### 1. Create a scene

```ts
const scene = Dogma.createScene("main", { priority: 1 });
```

### 2. Add a system

```ts
scene.addSystem("renderSystem");
```

### 3. Implement a system

```ts
class RenderSystem extends DogmaSystem {
  public onStart() {
    this.subscribeToPhase({
      phase: "render",
      func: this.onRender.bind(this),
      after: ["cameraSystem"],
    });
  }

  public onRender() {
    // render logic
  }
}
```

### 4. Spawn an entity

```ts
const entity = new MyEntity();
entity.addComponent("position", { x: 0, y: 0 });
EntityManager.spawnEntity(entity, "main");
```

### 5. Tick the engine

```ts
Dogma.tickAll();
```

## Practical notes

- `Dogma.tickAll()` should be called once per frame.
- `sceneDispatcher()` uses scene `priority` to order scenes.
- `systemDispatcher()` keeps phase subscriptions sorted by dependencies.
- Only active scenes and systems execute callbacks.
- `render` phase is skipped when `scene.getFlags().isRendered === false`.

## Internal behavior summary

1. `Dogma.tickAll()` updates scenes and systems.
2. `systemDispatcher()` adds new systems and phase subscribers.
3. `entityDispatcher()` commits components to scene state.
4. Phase callbacks run in defined order.
5. Topological sort ensures valid order inside each phase.

## Type definitions

- `DogmaPhase = "preUpdate" | "fixedUpdate" | "postUpdate" | "render" | "update"`
- `SystemRegistryKeys` is the key type from `dogmaConfig.systems`
- `ComponentRegistryKeys` is the key type from `dogmaConfig.components`

## Notes

This documentation is based on the current code structure in `src/core/dogma` and the shared engine types.
