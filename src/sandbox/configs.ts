import Phys from "./components/phys";
import Transform from "./components/transform";
import Inputs from "./systems/inputs";
import Physics from "./systems/physics";
import Render from "./systems/render";

export const dogmaConfig = {
  systems: { Render, Inputs, Physics },
  components: { Transform, Phys },
} satisfies DogmaConfig;
