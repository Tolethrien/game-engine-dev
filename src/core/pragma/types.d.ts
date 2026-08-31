import { EnginePhase } from "./pragma";
import PragmaComponent from "./component";
declare global {
  type PragmaPhase = keyof typeof EnginePhase;
  interface InternalPCProps {
    actor: PragmaActor;
  }
  type PragmaComponentClass<T extends PragmaComponent = PragmaComponent> = new (
    props: InternalPCProps,
    ...args: any[]
  ) => T;
  type DropFirst<T extends any[]> = T extends [any, ...infer Rest] ? Rest : [];
  type IteratedPragmaPhases = Exclude<
    PragmaPhase,
    "none" | "awake" | "destroy" | "start"
  >;
  type PragmaPhaseRegistry = Record<IteratedPragmaPhases, Set<PragmaComponent>>;
  type PragmaIndexRegistry = Record<IteratedPragmaPhases, Map<Symbol, number>>;
}
