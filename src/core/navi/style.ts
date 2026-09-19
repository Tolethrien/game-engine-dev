import { deepMerge, isPlainObject } from "@axiom/utils";
import type {
  DrawBackdrop,
  DrawOutline,
  DrawShadow,
} from "@aurora/urp/urpTypes";
import type { MaterialUse } from "@aurora/material";
export type Direction = "row" | "col";
export interface StyleOutline extends Omit<DrawOutline, "color"> {
  color?: RGBA;
}
// one material paints the whole shape, fill and outline (in.ring) alike, built with material.with({...})
export type StyleMaterial = MaterialUse;
export type AlignMain = "start" | "center" | "end" | "between";
export type AlignCross = "start" | "center" | "end" | "stretch";
export type Anchor = "start" | "center" | "end" | "stretch";
export type Overflow = "visible" | "clip" | "scroll";
export type TextAlign = "start" | "center" | "end";
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Style {
  backgroundColor: RGBA;
  rounded: number;
  backgroundImage: string | undefined;
  backgroundImageCrop: Crop;
  outline: StyleOutline | undefined;
  shadow: DrawShadow | DrawShadow[] | undefined;
  backdrop: DrawBackdrop | undefined;
  backgroundMaterial: StyleMaterial | undefined;
  textColor: RGBA;
  textOutline: StyleOutline | undefined;
  textShadow: DrawShadow | DrawShadow[] | undefined;
  textMaterial: StyleMaterial | undefined;
  textSize: number;
  textFont: string;
  layout: "none" | "stack" | "grid";
  direction: Direction;
  zIndex: number;
  gap: number;
  gapCross: number;
  padding: Padding;
  alignMain: AlignMain;
  alignCross: AlignCross;
  alignSelf: AlignCross | undefined;
  anchorX: Anchor;
  anchorY: Anchor;
  inset: Padding;
  gridCount: number;
  cellAlignX: Anchor;
  cellAlignY: Anchor;
  overflowX: Overflow;
  overflowY: Overflow;
  lineGap: number;
  transitionMs: number;
  scale: Position2D;
  nudge: Position2D;
  origin: Position2D;
  textAlign: TextAlign;
}

export const BASE_STYLE: Style = {
  backgroundColor: [255, 255, 255, 255],
  rounded: 0,
  backgroundImage: undefined,
  backgroundImageCrop: { x: 0, y: 0, width: 0, height: 0 },
  outline: undefined,
  shadow: undefined,
  backdrop: undefined,
  backgroundMaterial: undefined,
  textColor: [255, 255, 255, 255],
  textOutline: undefined,
  textShadow: undefined,
  textMaterial: undefined,
  textSize: 14,
  textFont: "lato",
  layout: "none",
  direction: "col",
  zIndex: 0,
  gap: 0,
  gapCross: 0,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  alignMain: "start",
  alignCross: "start",
  alignSelf: undefined,
  anchorX: "start",
  anchorY: "start",
  gridCount: 1,
  cellAlignX: "start",
  cellAlignY: "start",
  inset: { top: 0, right: 0, bottom: 0, left: 0 },
  overflowX: "visible",
  overflowY: "visible",
  lineGap: 0,
  transitionMs: 0,
  scale: { x: 1, y: 1 },
  nudge: { x: 0, y: 0 },
  origin: { x: 0.5, y: 0.5 },
  textAlign: "start",
};

// structuredClone would strip the prototype of a Material, instances stay shared
export function cloneStyle<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneStyle) as T;
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const key in value) out[key] = cloneStyle(value[key]);
  return out as T;
}

export function createStyle(o?: DeepPartial<Style>): Style {
  return cloneStyle(deepMerge(BASE_STYLE, o ?? {}));
}
export function mergeStyle(base: Style, over: DeepPartial<Style>): Style {
  return cloneStyle(deepMerge(base, over));
}
