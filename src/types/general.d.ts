import { dogmaConfig } from "@sandbox/configs";
declare global {
  type Size2D = { width: number; height: number };
  type Position2D = { x: number; y: number };
  type Position3D = { x: number; y: number; z: number };
  interface DogmaConfig {
    components: Record<string, new (...args: any[]) => Component>;
    systems: Record<string, new (...args: any[]) => System>;
  }
  type DogmaPhase =
    | "preUpdate"
    | "fixedUpdate"
    | "postUpdate"
    | "render"
    | "update";
  type DropFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : [];
  type ComponentRegistryKeys = keyof typeof dogmaConfig.components;
  type ComponentRegistry = typeof dogmaConfig.components;
  type SystemRegistryKeys = keyof typeof dogmaConfig.systems;
  type SystemRegistry = typeof dogmaConfig.systems;
}
