import type Material from "@/core/aurora/material";
import type ScreenEffect from "@/core/aurora/urp/effects/screenEffect";
import {
  EFFECT_LAYER_DEFAULTS,
  type PostDraw,
  type ResolvedLayer,
} from "@/core/aurora/urp/draw/drawPost";
import type { EffectLayer, EffectStage } from "@/core/aurora/urp/draw/drawTypes";
import type { TweakField } from "../tweak/report";
import type {
  TweakFieldsSection,
  TweakListSection,
  TweakPanel,
  UrpDebugData,
} from "../../interfaces";
import { formatLiteral } from "../command/parse";
import { SCREEN_BLENDS } from "./mood";
import { auroraPage } from "./pages";

type Item = Record<string, unknown>;

const MASKS = ["full", "vignette"] as const;
// the effect a stored set of params belongs to: after a change of effect they are stale
const PARAMS_FOR = "paramsFor";
const VIGNETTE_KEYS = ["reach", "smoothness", "roundness", "center"] as const;

const STAGES: { stage: EffectStage; title: string }[] = [
  { stage: "world", title: "World — before light composite (gets lit)" },
  { stage: "hdr", title: "HDR — before the post lut" },
  { stage: "screen", title: "Screen — after the post lut, before GUI" },
];

// a param named like a layer field must not collide with it
const paramKey = (name: string) => `param:${name}`;

const slider = (key: string, min: number, max: number): TweakField => ({
  key,
  control: { kind: "slider", min, max, step: 0.01 },
});

function toItem(layer: ResolvedLayer): Item {
  const { effect, params, ...rest } = layer;
  const item: Item = { effect: effect.name, [PARAMS_FOR]: effect.name, ...rest };
  effect.paramNames.forEach((name, slot) => (item[paramKey(name)] = params[slot]));
  return item;
}

function toLayer(urp: UrpDebugData, item: Item): EffectLayer {
  const effect = urp.effect(item.effect as string);
  const values: Record<string, number> = {};
  if (item[PARAMS_FOR] === item.effect)
    for (const name of effect.paramNames) {
      const value = item[paramKey(name)];
      if (typeof value === "number") values[name] = value;
    }
  return {
    effect,
    params: effect.pack(values),
    intensity: item.intensity as number,
    blend: item.blend as EffectLayer["blend"],
    color: item.color as RGBA,
    mask: item.mask as EffectLayer["mask"],
    reach: item.reach as number,
    smoothness: item.smoothness as number,
    roundness: item.roundness as number,
    center: item.center as Position2D,
  };
}

function itemFields(urp: UrpDebugData, value: Item): TweakField[] {
  const fields: TweakField[] = [
    {
      key: "effect",
      control: { kind: "select", options: urp.effects().map((effect) => effect.name) },
    },
  ];
  const effect = urp.effects().find((entry) => entry.name === value.effect);
  effect?.paramNames.forEach((name, slot) => {
    const range = effect.ranges[slot];
    fields.push({
      key: paramKey(name),
      label: name,
      control: range
        ? { kind: "slider", min: range[0], max: range[1], step: 0.01 }
        : { kind: "number" },
    });
  });
  fields.push(
    slider("intensity", 0, 1),
    { key: "blend", control: { kind: "select", options: SCREEN_BLENDS } },
    { key: "color", control: { kind: "color" } },
    { key: "mask", control: { kind: "select", options: MASKS } },
  );
  if (value.mask === "vignette")
    fields.push(
      slider("reach", 0, 2),
      slider("smoothness", 0, 1),
      slider("roundness", 0, 1),
      { key: "center", control: { kind: "point" } },
    );
  return fields;
}

function formatItem(urp: UrpDebugData, item: Item): string {
  const effect = urp.effect(item.effect as string);
  const parts = [`effect: ScreenEffect.get(${JSON.stringify(effect.name)})`];
  const values: Record<string, number> = {};
  if (item[PARAMS_FOR] === item.effect)
    for (const name of effect.paramNames) values[name] = item[paramKey(name)] as number;
  const params = effect.pack(values);
  if (JSON.stringify(params) !== JSON.stringify(effect.defaults))
    parts.push(`params: ${formatLiteral(params)}`);
  const defaults: Record<string, unknown> = EFFECT_LAYER_DEFAULTS;
  for (const key of Object.keys(defaults)) {
    if ((VIGNETTE_KEYS as readonly string[]).includes(key) && item.mask !== "vignette") continue;
    if (JSON.stringify(item[key]) === JSON.stringify(defaults[key])) continue;
    parts.push(`${key}: ${formatLiteral(item[key])}`);
  }
  return `{ ${parts.join(", ")} }`;
}

function newItem(effect: ScreenEffect): Item {
  const item: Item = structuredClone({
    effect: effect.name,
    [PARAMS_FOR]: effect.name,
    ...EFFECT_LAYER_DEFAULTS,
  });
  effect.paramNames.forEach((name, slot) => (item[paramKey(name)] = effect.defaults[slot]));
  return item;
}

function stageSection(
  post: PostDraw,
  urp: UrpDebugData,
  stage: EffectStage,
  title: string,
): TweakListSection {
  return {
    title,
    call: "Post.setEffects",
    arg: "list",
    item: {
      fields: (value) => itemFields(urp, value),
      // a reset of one field takes the defaults of the element's own effect
      create(value) {
        const effects = urp.effects();
        const effect = effects.find((entry) => entry.name === value?.effect) ?? effects[0];
        return effect ? newItem(effect) : null;
      },
      label: (value) => `${value.effect} · ${Number((value.intensity as number).toFixed(2))}`,
    },
    defaults: [],
    get: () => post.getEffectLayers(stage).map(toItem),
    set: (items) => post.setEffects(stage, items.map((item) => toLayer(urp, item))),
    format: (items) =>
      `Post.setEffects("${stage}", [${items.map((item) => formatItem(urp, item)).join(", ")}])`,
  };
}

export function effectsPanel(post: PostDraw, urp: UrpDebugData): TweakPanel {
  return {
    title: "Effects",
    ...auroraPage("effects"),
    live: true,
    sections: STAGES.map(({ stage, title }) => stageSection(post, urp, stage, title)),
  };
}

function catalogSection(
  title: string,
  call: string,
  rows: () => [name: string, text: string][],
): TweakFieldsSection {
  return {
    title,
    call,
    arg: "object",
    get fields() {
      return rows().map(([name]): TweakField => ({ key: name, control: { kind: "info" } }));
    },
    get: () => Object.fromEntries(rows()),
    set: () => {},
  };
}

function paramsText(
  names: readonly string[],
  defaults: readonly number[],
  ranges?: readonly ([number, number] | null)[],
) {
  if (names.length === 0) return "no params";
  return names
    .map((name, slot) => {
      const range = ranges?.[slot];
      return `${name} ${defaults[slot]}${range ? ` [${range[0]}..${range[1]}]` : ""}`;
    })
    .join(", ");
}

export function catalogPanel(
  urp: UrpDebugData,
  materials: () => readonly Material[],
): TweakPanel {
  return {
    title: "Catalog",
    ...auroraPage("catalog"),
    live: true,
    exportable: false,
    presets: false,
    sections: [
      catalogSection("Screen effects", "ScreenEffect.create", () =>
        urp.effects().map((effect) => [
          effect.name,
          paramsText(effect.paramNames, effect.defaults, effect.ranges),
        ]),
      ),
      catalogSection("Materials", "Material.create", () =>
        materials().map((material) => [
          material.name,
          [
            material.blend,
            material.transparent ? "transparent" : null,
            material.emissive ? "emissive" : null,
            paramsText(material.paramNames, material.defaults),
          ]
            .filter(Boolean)
            .join(" · "),
        ]),
      ),
    ],
  };
}
