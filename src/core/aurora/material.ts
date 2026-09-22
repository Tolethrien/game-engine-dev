import { assert } from "@axiom/utils";
import RenderGraph from "./renderGraph";
import Blend from "./utils/blend";
import type { MaterialParams } from "./urp/draw/drawTypes";

export type MaterialBlend = "normal" | "additive";
export type MaterialValues<Name extends string> = Partial<Record<Name, number>>;
export interface MaterialOptions<Name extends string> {
  name: string;
  fragment: string;
  blend?: MaterialBlend;
  transparent?: boolean;
  // names with defaults, key order is the slot in the shader: in.params.x, y, z, w
  params?: Record<Name, number>;
}
export interface MaterialUse {
  use: Material;
  params: MaterialParams;
}

export default class Material<Name extends string = string> {
  private static registry: Material[] = [];

  public readonly id: number;
  public readonly name: string;
  public readonly fragment: string;
  public readonly blend: MaterialBlend;
  public readonly transparent: boolean;
  public readonly paramNames: readonly Name[];
  public readonly defaults: MaterialParams;

  private constructor(
    id: number,
    {
      name,
      fragment,
      blend = "normal",
      transparent = false,
      params,
    }: MaterialOptions<Name>,
  ) {
    this.id = id;
    this.name = name;
    this.fragment = fragment;
    this.blend = blend;
    this.transparent = transparent || blend !== "normal";
    this.paramNames = params ? (Object.keys(params) as Name[]) : [];
    assert(
      this.paramNames.length <= 4,
      `Material "${name}" has ${this.paramNames.length} params, a shape carries at most 4`,
    );
    const defaults: MaterialParams = [0, 0, 0, 0];
    this.paramNames.forEach((param, slot) => (defaults[slot] = params![param]));
    this.defaults = defaults;
  }

  /** registers the material, passes build pipelines for every registered one */
  public static create<const Name extends string = never>(
    options: MaterialOptions<Name>,
  ) {
    assert(
      !this.registry.some((material) => material.name === options.name),
      `Material "${options.name}" already exists`,
    );
    const material = new Material<Name>(this.registry.length, options);
    this.registry.push(material);
    if (RenderGraph.isBuilt) void RenderGraph.rebuild();
    return material;
  }

  public static get getAll(): readonly Material[] {
    return this.registry;
  }

  // a new array each call: pack once and keep it, not per draw in a hot loop
  public pack(values: MaterialValues<Name> = {}): MaterialParams {
    const params = [...this.defaults] as MaterialParams;
    this.paramNames.forEach((param, slot) => {
      const value = values[param];
      if (value !== undefined) params[slot] = value;
    });
    return params;
  }

  public with(values: MaterialValues<Name> = {}): MaterialUse {
    return { use: this, params: this.pack(values) };
  }

  public get gpuBlend(): GPUBlendState {
    return this.blend === "additive"
      ? Blend.additivePremultiplied
      : Blend.premultiplied;
  }
}
