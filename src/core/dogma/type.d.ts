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
  type ComponentRegistryKeys = keyof typeof dogmaConfig.components;
  type ComponentRegistry = typeof dogmaConfig.components;
  type SystemRegistryKeys = keyof typeof dogmaConfig.systems;
  type SystemRegistry = typeof dogmaConfig.systems;
  type DropFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : [];
}
