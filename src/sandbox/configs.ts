import Sraka from "./pragma/sraka";
import Transform from "./pragma/transform";

export const dogmaConfig = {
  systems: {},
  components: {},
} satisfies DogmaConfig;
export const pragmaConfig = {
  components: { Transform, Sraka },
  systems: {},
} satisfies PragmaConfig;
