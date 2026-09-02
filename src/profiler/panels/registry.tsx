import { Component } from "solid-js";
import type { PanelProps } from "../components/panel";
import AuroraPanel from "./aurora";
import CelloPanel from "./cello";

export const PANELS = {
  aurora: AuroraPanel,
  cello: CelloPanel,
} satisfies Record<string, Component<PanelProps>>;

export type PanelID = keyof typeof PANELS;
export const PANEL_IDS = Object.keys(PANELS) as PanelID[];
