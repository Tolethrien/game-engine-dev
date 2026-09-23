import Bars from "../../blocks/bars";
import StatGrid from "../../blocks/statGrid";
import { Block, Rows } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import { formatBytes } from "../../format";

export default function AuroraVramPanel() {
  const memory = () => auroraStore.latestState()?.memory;
  const items = () =>
    [...(memory()?.rows ?? [])]
      .sort((left, right) => right.bytes - left.bytes)
      .map((row) => ({
        label: row.group,
        value: row.bytes,
        text: formatBytes(row.bytes),
      }));

  return (
    <Rows>
      <Block size="fit">
        <StatGrid
          stats={[
            { label: "Total", value: formatBytes(memory()?.total) },
            { label: "Textures", value: formatBytes(memory()?.textures) },
            { label: "Buffers", value: formatBytes(memory()?.buffers) },
          ]}
        />
        <div class="mt-1 text-caption text-fg-dim">
          estimate, no driver alignment, no canvas swapchain
        </div>
      </Block>
      <Block size="fill">
        <Bars items={items()} />
      </Block>
    </Rows>
  );
}
