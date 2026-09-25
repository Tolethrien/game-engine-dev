import { assert } from "@axiom/utils";
import RenderGraph from "@aurora/renderGraph";
import type { MaterialParams } from "../draw/drawTypes";

export type EffectValues<Name extends string> = Partial<Record<Name, number>>;
export interface ScreenEffectOptions<Name extends string> {
  name: string;
  // defines fn effect(in: EffectInput) -> vec4f, see effects/effectShader.wgsl
  fragment: string;
  // names with defaults, key order is the slot in the shader: in.params.x, y, z, w
  params?: Record<Name, number>;
  // slider range of a param in the debugger, nothing else reads it
  ranges?: Partial<Record<Name, [number, number]>>;
}

// a full screen shader of the game, run per pixel by an EffectPass stage through Post.setEffects;
// like Material, but its input is the screen pixel and the scene under it, not a shape
export default class ScreenEffect<Name extends string = string> {
  private static registry: ScreenEffect[] = [];

  public readonly id: number;
  public readonly name: string;
  public readonly fragment: string;
  public readonly paramNames: readonly Name[];
  public readonly defaults: MaterialParams;
  public readonly ranges: readonly ([number, number] | null)[];

  private constructor(
    id: number,
    { name, fragment, params, ranges }: ScreenEffectOptions<Name>,
  ) {
    this.id = id;
    this.name = name;
    this.fragment = fragment;
    this.paramNames = params ? (Object.keys(params) as Name[]) : [];
    assert(
      this.paramNames.length <= 4,
      `Screen effect "${name}" has ${this.paramNames.length} params, at most 4 fit`,
    );
    const defaults: MaterialParams = [0, 0, 0, 0];
    this.paramNames.forEach((param, slot) => (defaults[slot] = params![param]));
    this.defaults = defaults;
    this.ranges = this.paramNames.map((param) => ranges?.[param] ?? null);
  }

  // every stage builds a pipeline per registered effect, so one made after the start rebuilds
  public static create<const Name extends string = never>(
    options: ScreenEffectOptions<Name>,
  ) {
    assert(
      !this.registry.some((effect) => effect.name === options.name),
      `Screen effect "${options.name}" already exists`,
    );
    const effect = new ScreenEffect<Name>(this.registry.length, options);
    this.registry.push(effect);
    if (RenderGraph.isBuilt) void RenderGraph.rebuild();
    return effect;
  }

  public static get getAll(): readonly ScreenEffect[] {
    return this.registry;
  }

  public static get(name: string): ScreenEffect {
    const effect = this.registry.find((entry) => entry.name === name);
    assert(
      effect !== undefined,
      `Screen effect "${name}" does not exist, available: ${this.registry.map((entry) => entry.name).join(", ") || "none"}`,
    );
    return effect;
  }

  // a new array each call: pack once and keep it, or change its slots in place
  public pack(values: EffectValues<Name> = {}): MaterialParams {
    const params = [...this.defaults] as MaterialParams;
    this.paramNames.forEach((param, slot) => {
      const value = values[param];
      if (value !== undefined) params[slot] = value;
    });
    return params;
  }
}
