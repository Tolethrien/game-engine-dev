import { dogmaConfig } from "@sandbox/configs";
declare global {
  interface DogmaConfig {
    components: Record<string, new (...args: any[]) => Component>;
    systems: Record<string, new (...args: any[]) => System>;
  }
  type DogmaPhase =
    | "preUpdate"
    | "fixedUpdate"
    | "postUpdate"
    | "render"
    | "update"
    | "eventsDeferred";
  type DogmaComponentRegistryKeys = keyof typeof dogmaConfig.components;
  type DogmaComponentRegistry = typeof dogmaConfig.components;
  type DogmaSystemRegistryKeys = keyof typeof dogmaConfig.systems;
  type DogmaSystemRegistry = typeof dogmaConfig.systems;
  type DropFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : [];
}
