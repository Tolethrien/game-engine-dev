import Material from "../../material";
import defaultMaterial from "../materials/default.wgsl?raw";

export const DEFAULT_MATERIAL = Material.create({
  fragment: defaultMaterial,
  name: "DEFAULT_MATERIAL",
});
