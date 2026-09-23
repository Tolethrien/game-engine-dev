import { Index, Show } from "solid-js";
import type { KeyValueItem } from "../../blocks/keyValue";
import Table, { type TableColumn } from "../../blocks/table";
import { Block, Cols } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import { formatBytes } from "../../format";

interface Section {
  title: string;
  items?: KeyValueItem[];
  table?: { columns: TableColumn[]; rows: string[][] };
}

const OPTION_COLUMNS: TableColumn[] = [
  { label: "Option", width: "max-content" },
  { label: "Value" },
];

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
    {
      title: `Passes (${config.passes.length})`,
      table: {
        columns: [{ label: "#", width: "auto" }, { label: "Pass" }],
        rows: config.passes.map((name, index) => [String(index), name]),
      },
    },
    {
      title: `Materials (${config.materials.length})`,
      table: {
        columns: [{ label: "Id", width: "auto" }, { label: "Name" }],
        rows: config.materials.map((name, id) => [String(id), name]),
      },
    },
  ];
}

// Index keeps the DOM across state updates, so text stays selectable
function Sections(props: { sections: Section[] }) {
  return (
    <Index each={props.sections}>
      {(section, index) => (
        <>
          <div
            class="text-caption uppercase tracking-[0.1em] text-fg-dim"
            classList={{ "mt-2": index > 0 }}
          >
            {section().title}
          </div>
          <Show when={section().items}>
            {(items) => (
              <Table
                columns={OPTION_COLUMNS}
                rows={items().map((item) => [item.key, item.value])}
                cellColor={(row, column) =>
                  column === 1 ? items()[row]?.color : undefined
                }
              />
            )}
          </Show>
          <Show when={section().table}>
            {(table) => <Table columns={table().columns} rows={table().rows} />}
          </Show>
        </>
      )}
    </Index>
  );
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
