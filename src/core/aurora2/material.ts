import { assert } from "@axiom/utils";
import RenderGraph from "./renderGraph";
import Blend from "./utils/blend";

export type MaterialBlend = "normal" | "additive";
export interface MaterialOptions {
  name: string;
  fragment: string;
  blend?: MaterialBlend;
  transparent?: boolean;
}

export default class Material {
  private static registry: Material[] = [];

  public readonly id: number;
  public readonly name: string;
  public readonly fragment: string;
  public readonly blend: MaterialBlend;
  public readonly transparent: boolean;

  private constructor(
    id: number,
    { name, fragment, blend = "normal", transparent = false }: MaterialOptions,
  ) {
    this.id = id;
    this.name = name;
    this.fragment = fragment;
    this.blend = blend;
    this.transparent = transparent || blend !== "normal";
  }

  /** registers the material, passes build pipelines for every registered one */
  public static create(options: MaterialOptions) {
    assert(
      !this.registry.some((material) => material.name === options.name),
      `Material "${options.name}" already exists`,
    );
    const material = new Material(this.registry.length, options);
    this.registry.push(material);
    if (RenderGraph.isBuilt) void RenderGraph.rebuild();
    return material;
  }

  public static get getAll(): readonly Material[] {
    return this.registry;
  }

  public get gpuBlend(): GPUBlendState {
    return this.blend === "additive"
      ? Blend.additivePremultiplied
      : Blend.premultiplied;
  }
}
