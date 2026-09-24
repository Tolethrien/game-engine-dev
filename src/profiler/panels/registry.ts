import { createComponent, type Component } from "solid-js";
import { auroraStore } from "../aurora/store";
import AuroraFramePanel from "./aurora/frame";
import AuroraGpuTimingsPanel from "./aurora/gpuTimings";
import AuroraTimelinePanel from "./aurora/timeline";
import AuroraDrawPanel from "./aurora/draw";
import AuroraVramPanel from "./aurora/vram";
import AuroraResourcesPanel from "./aurora/resources";
import AuroraConfigPanel from "./aurora/config";
import AuroraPresetPanel from "./aurora/preset";
import WatchPanel from "./watch/watch";
import { watchStore } from "../watch/store";

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

type StaticPanelId = keyof typeof PANELS;
export type PanelId = StaticPanelId | `watch:${string}`;

const WATCH_PANEL = {
  prefix: "watch:" as const,
  defaultSize: { w: 3, h: 3 },
};

// created lazily and kept, so a panel keeps the same definition across re-renders
const watchDefinitions = new Map<string, PanelDefinition>();

export const watchPanelId = (name: string): PanelId =>
  `${WATCH_PANEL.prefix}${name}`;

export const isPanelId = (id: string): id is PanelId =>
  id in PANELS || id.startsWith(WATCH_PANEL.prefix);

export function panelDefinition(id: PanelId): PanelDefinition {
  if (id in PANELS) return PANELS[id as StaticPanelId];
  const name = id.slice(WATCH_PANEL.prefix.length);
  let definition = watchDefinitions.get(name);
  if (!definition) {
    definition = {
      title: () => {
        const info = watchStore.info(name);
        return info ? `${info.scope} · ${name}` : name;
      },
      get size() {
        return watchStore.info(name)?.size ?? WATCH_PANEL.defaultSize;
      },
      component: () => createComponent(WatchPanel, { name }),
      live: () => watchStore.has(name),
    };
    watchDefinitions.set(name, definition);
  }
  return definition;
}
