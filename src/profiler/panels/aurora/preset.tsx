import { Show } from "solid-js";
import Sections, { type Section } from "../../blocks/sections";
import { Block, Rows } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import type { AuroraPresetState } from "@/core/debugger/modules/aurora/report";

const items = (record: Record<string, string>) =>
  Object.entries(record).map(([key, value]) => ({ key, value }));

function presetSections(preset: AuroraPresetState): Section[] {
  const sections: Section[] = [
    {
      title: "Options",
      items: [{ key: "preset", value: preset.name }, ...items(preset.config)],
    },
  ];
  const info = items(preset.info);
  if (info.length > 0) sections.push({ title: "Info", items: info });
  sections.push(
    {
      title: `Passes (${preset.passes.length})`,
      table: {
        columns: [{ label: "#", width: "auto" }, { label: "Pass" }],
        rows: preset.passes.map((name, index) => [String(index), name]),
      },
    },
    {
      title: `Materials (${preset.materials.length})`,
      table: {
        columns: [{ label: "Id", width: "auto" }, { label: "Name" }],
        rows: preset.materials.map((name, id) => [String(id), name]),
      },
    },
  );
  return sections;
}

export default function AuroraPresetPanel() {
  const preset = () => auroraStore.latestState()?.preset;

  return (
    <Show
      when={preset()}
      fallback={<span class="italic text-fg-dim">no preset</span>}
    >
      {(current) => (
        <Rows>
          <Block size="fill">
            <Sections sections={presetSections(current())} />
          </Block>
        </Rows>
      )}
    </Show>
  );
}
