import Material from "../../material";
import defaultMaterial from "../materials/default.wgsl?raw";
import emissiveMaterial from "../materials/emissive.wgsl?raw";

export const DEFAULT_MATERIAL = Material.create({
  fragment: defaultMaterial,
  name: "DEFAULT_MATERIAL",
});
// ignores the light map; intensity above 1 is bloom
export const EMISSIVE_MATERIAL = Material.create({
  fragment: emissiveMaterial,
  name: "EMISSIVE_MATERIAL",
  emissive: true,
  params: { intensity: 1 },
});
