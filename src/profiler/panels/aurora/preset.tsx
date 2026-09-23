import Table from "../../blocks/table";
import { Block, Rows } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";

const COLUMNS = [
  { label: "Option", width: "max-content" },
  { label: "Value" },
];

export default function AuroraPresetPanel() {
  const rows = () => {
    const preset = auroraStore.latestState()?.preset;
    if (!preset) return [];
    return [
      ["preset", preset.name],
      ...Object.entries(preset.config),
      ...Object.entries(preset.info),
    ];
  };

  return (
    <Rows>
      <Block size="fill">
        <Table columns={COLUMNS} rows={rows()} empty="no preset" />
      </Block>
    </Rows>
  );
}
