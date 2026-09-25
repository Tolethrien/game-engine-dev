import { RENDER } from "@/core/aurora/config";
import type { TweakField } from "../tweak/report";
import type { AuroraDebugData, TweakFieldsSection, TweakPanel } from "../../interfaces";
import { formatLiteral } from "../command/parse";
import { auroraPage } from "./pages";

const info = (key: string, label?: string): TweakField => ({
  key,
  label,
  control: { kind: "info" },
});

function renderingSection(source: () => AuroraDebugData): TweakFieldsSection {
  return {
    title: "Rendering",
    call: "Aurora.setParameter",
    arg: "object",
    fields: [
      { key: "renderRes", control: { kind: "select", options: RENDER.resolutions } },
      {
        key: "renderScale",
        control: { kind: "slider", ...RENDER.scale, step: 0.05 },
        // every step reallocates the render sized textures
        apply: "release",
      },
      { key: "canvasColor", control: { kind: "color" } },
      { key: "gamma", control: { kind: "slider", min: 0.5, max: 2, step: 0.01 } },
    ],
    // setParameter is deferred to beginFrame, so a new value shows up one poll later
    get() {
      const { renderRes, renderScale, canvasColor, gamma } = source().settings().rendering;
      return { renderRes, renderScale, canvasColor: [...canvasColor], gamma };
    },
    set: (values) => source().setParameter({ rendering: values }),
    format: (values) => `Aurora.setParameter({ rendering: ${formatLiteral(values)} })`,
  };
}

function configSection(source: () => AuroraDebugData): TweakFieldsSection {
  return {
    title: "Config",
    call: "Aurora.config",
    arg: "object",
    fields: [
      info("colorSpace"),
      info("transparentCanvas"),
      info("normalMaps"),
      info("heightMaps"),
      info("computeGroupSize"),
      info("renderSize", "render size"),
      info("viewHeight", "view height"),
      info("cameraOrigin", "camera origin"),
      info("fontAtlas"),
      info("textures"),
      info("ui"),
      info("fonts"),
    ],
    get() {
      const settings = source().settings();
      const { rendering, fontAtlas } = settings;
      return {
        colorSpace: rendering.colorSpace,
        transparentCanvas: rendering.transparentCanvas,
        normalMaps: rendering.normalMaps,
        heightMaps: rendering.heightMaps,
        computeGroupSize: rendering.computeGroupSize,
        renderSize: `${source().renderSize().width}×${source().renderSize().height}`,
        viewHeight: settings.camera.viewHeight,
        cameraOrigin: settings.camera.origin,
        fontAtlas: `${fontAtlas.pageSize}×${fontAtlas.pageSize} × ${fontAtlas.pages} pages, spread ${fontAtlas.spread}`,
        textures: settings.userTextures.length,
        ui: settings.userUI.length,
        fonts: settings.fonts.length,
      };
    },
    set: () => {},
  };
}

export function settingsPanel(source: () => AuroraDebugData): TweakPanel {
  return {
    title: "Settings",
    ...auroraPage("settings"),
    sections: [renderingSection(source), configSection(source)],
  };
}
