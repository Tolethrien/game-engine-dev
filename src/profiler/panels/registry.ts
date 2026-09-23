import type { Component } from "solid-js";
import { auroraStore } from "../aurora/store";
import AuroraFramePanel from "./aurora/frame";
import AuroraGpuTimingsPanel from "./aurora/gpuTimings";
import AuroraTimelinePanel from "./aurora/timeline";
import AuroraDrawPanel from "./aurora/draw";
import AuroraVramPanel from "./aurora/vram";
import AuroraResourcesPanel from "./aurora/resources";
import AuroraConfigPanel from "./aurora/config";
import AuroraPresetPanel from "./aurora/preset";

export interface PanelDefinition {
  title: string | (() => string);
  size: { w: number; h: number };
  component: Component;
  live?: () => boolean;
}

export const PANELS = {
  auroraFrame: {
    title: "GPU frame",
    size: { w: 4, h: 2 },
    component: AuroraFramePanel,
    live: auroraStore.live,
  },
  auroraGpuTimings: {
    title: "GPU timings",
    size: { w: 5, h: 3 },
    component: AuroraGpuTimingsPanel,
    live: auroraStore.live,
  },
  auroraTimeline: {
    title: "GPU timeline",
    size: { w: 8, h: 3 },
    component: AuroraTimelinePanel,
    live: auroraStore.live,
  },
  auroraDraw: {
    title: "Draw",
    size: { w: 6, h: 4 },
    component: AuroraDrawPanel,
    live: auroraStore.live,
  },
  auroraVram: {
    title: "VRAM",
    size: { w: 4, h: 3 },
    component: AuroraVramPanel,
    live: auroraStore.live,
  },
  auroraResources: {
    title: "Resources",
    size: { w: 8, h: 4 },
    component: AuroraResourcesPanel,
    live: auroraStore.live,
  },
  auroraConfig: {
    title: "Aurora Config",
    size: { w: 8, h: 4 },
    component: AuroraConfigPanel,
    live: auroraStore.live,
  },
  auroraPreset: {
    title: "Preset Config",
    size: { w: 3, h: 2 },
    component: AuroraPresetPanel,
    live: auroraStore.live,
  },
} satisfies Record<string, PanelDefinition>;

export const panelTitle = (definition: PanelDefinition) =>
  typeof definition.title === "function"
    ? definition.title()
    : definition.title;

export type PanelId = keyof typeof PANELS;
