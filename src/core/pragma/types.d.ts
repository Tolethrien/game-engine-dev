import { pragmaConfig } from "@sandbox/configs";
import { EnginePhase } from "./pragma";
import PragmaComponent from "./component";
declare global {
  interface PragmaConfig {
    components: Record<string, new (...args: any[]) => Component>;
    systems: Record<string, new (...args: any[]) => System>;
  }
  type PragmaPhase = keyof typeof EnginePhase;
  type PragmaComponentRegistryKeys = keyof typeof pragmaConfig.components;
  type PragmaComponentRegistry = typeof pragmaConfig.components;
  type PragmaSystemRegistryKeys = keyof typeof pragmaConfig.systems;
  type PragmaSystemRegistry = typeof pragmaConfig.systems;
  type DropFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : [];
  type IteratedPragmaPhases = Exclude<
    PragmaPhase,
    "none" | "awake" | "destroy" | "start"
  >;
  type PragmaPhaseRegistry = Record<IteratedPragmaPhases, Set<PragmaComponent>>;
  type PragmaIndexRegistry = Record<IteratedPragmaPhases, Map<Symbol, number>>;
}
