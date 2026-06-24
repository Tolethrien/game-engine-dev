import Move from "./temp/move";
import Anim from "./temp/Anim";
import Rend from "./temp/rend";
import Trans from "./temp/trans";

export const dogmaConfig = {
  systems: { Anim, Rend },
  components: { Move, Trans },
} satisfies DogmaConfig;
