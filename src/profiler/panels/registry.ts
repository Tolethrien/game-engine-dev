import type { Component } from "solid-js";
import { auroraData } from "../data";
import AuroraGpuPanel from "./aurora/gpu";
import AuroraPassTimesPanel from "./aurora/passTimes";
import AuroraCallsPanel from "./aurora/calls";
import AuroraGeometryPanel from "./aurora/geometry";
import AuroraCountersPanel from "./aurora/counters";
import AuroraResourcesPanel from "./aurora/resources";
import AuroraMockListPanel from "./aurora/mockList";

export interface PanelDefinition {
  title: string;
  size: { w: number; h: number };
  component: Component;
  live?: () => boolean;
}

export const PANELS = {
  auroraGpu: {
    title: "GPU time",
    size: { w: 3, h: 2 },
    component: AuroraGpuPanel,
    live: auroraData.live,
  },
  auroraPassTimes: {
    title: "Pass times",
    size: { w: 4, h: 3 },
    component: AuroraPassTimesPanel,
    live: auroraData.live,
  },
  auroraCalls: {
    title: "Calls",
    size: { w: 3, h: 2 },
    component: AuroraCallsPanel,
    live: auroraData.live,
  },
  auroraGeometry: {
    title: "Geometry",
    size: { w: 3, h: 2 },
    component: AuroraGeometryPanel,
    live: auroraData.live,
  },
  auroraCounters: {
    title: "Counters",
    size: { w: 4, h: 3 },
    component: AuroraCountersPanel,
    live: auroraData.live,
  },
  auroraResources: {
    title: "Resources",
    size: { w: 6, h: 4 },
    component: AuroraResourcesPanel,
    live: auroraData.live,
  },
  auroraMockList: {
    title: "Mock list",
    size: { w: 3, h: 3 },
    component: AuroraMockListPanel,
  },
} satisfies Record<string, PanelDefinition>;

export type PanelId = keyof typeof PANELS;
