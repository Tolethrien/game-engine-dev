import { Show } from "solid-js";
import type { KeyValueItem } from "../../blocks/keyValue";
import Sections, { type Section } from "../../blocks/sections";
import { Block, Cols } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import { formatBytes } from "../../format";
import type { AuroraState } from "@/core/debugger/modules/aurora/report";

const size = ({ width, height }: Size2D) => `${width}×${height}`;

// "[255, 25, 55, 255]" (RGBA 0–255) → css color for the swatch
function cssColor(rgba: string) {
  const [red, green, blue, alpha = 255] = rgba
    .replace(/[[\]]/g, "")
    .split(",")
    .map(Number);
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function leftSections(state: AuroraState): Section[] {
  const { config, memory, gpu } = state;
  const fontsMemory = memory.rows.find((row) => row.group === "fonts");
  const renderSize = size(config.renderSize);

  const rendering: KeyValueItem[] = Object.entries(config.rendering).map(
    ([key, value]) =>
      key === "canvasColor"
        ? { key, value, color: cssColor(value) }
        : { key, value },
  );
  // renderRes already names the size unless something resized the render target
  if (config.rendering.renderRes !== renderSize.replace("×", "x"))
    rendering.push({ key: "render size", value: renderSize });
  rendering.push(
    { key: "canvas", value: size(config.canvas) },
    { key: "canvas format", value: config.canvas.format },
  );

  const adapter = gpu.adapter;
  const device: KeyValueItem[] = [
    {
      key: "WebGPU",
      value: adapter
        ? `${adapter.vendor} ${adapter.architecture}${adapter.isFallbackAdapter ? " (fallback)" : ""}`
        : "—",
    },
    // only the card in use, the other ones in the machine do not matter
    ...gpu.devices
      .filter((entry) => entry.active)
      .map((entry) => ({
        key: entry.deviceString ?? "unknown",
        value: entry.driverVersion ?? "—",
      })),
  ];

  return [
    { title: "Rendering", items: rendering },
    {
      title: "Font atlas",
      items: [
        { key: "page size", value: String(config.fontAtlas.pageSize) },
        { key: "pages", value: String(config.fontAtlas.pages) },
        { key: "spread", value: String(config.fontAtlas.spread) },
        { key: "memory", value: formatBytes(fontsMemory?.bytes) },
      ],
    },
    { title: "Device", items: device },
  ];
}

function rightSections({ config }: AuroraState): Section[] {
  return [
    {
      title: "Assets",
      items: [
        { key: "textures", value: String(config.textures) },
        { key: "ui textures", value: String(config.uiTextures) },
      ],
    },
    {
      title: `Fonts (${config.fonts.length})`,
      table: {
        columns: [{ label: "Name" }, { label: "Type", width: "auto" }],
        rows: config.fonts.map((font) => [font.name, font.type]),
      },
    },
  ];
}

export default function AuroraConfigPanel() {
  const state = () => auroraStore.latestState();

  return (
    <Show
      when={state()}
      fallback={<span class="italic text-fg-dim">no config</span>}
    >
      {(current) => (
        <Cols>
          <Block size="fill">
            <Sections sections={leftSections(current())} />
          </Block>
          <Block size="fill">
            <Sections sections={rightSections(current())} />
          </Block>
        </Cols>
      )}
    </Show>
  );
}
