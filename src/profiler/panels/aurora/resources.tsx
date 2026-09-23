import type { GraphTexture } from "@/core/aurora/renderGraph";
import Table from "../../blocks/table";
import StatGrid from "../../blocks/statGrid";
import { Block, Rows } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import { METRIC_KEYS } from "@/core/debugger/modules/aurora/keys";
import { formatBytes } from "../../format";

// "627×353 · 6 mips · 3 layers"
function textureSize(texture: GraphTexture) {
  const parts = [`${texture.width}×${texture.height}`];
  if (texture.mips > 1) parts.push(`${texture.mips} mips`);
  if (texture.layers > 1) parts.push(`${texture.layers} layers`);
  return parts.join(" · ");
}

// "5 · 35.20 MB"
function countAndBytes(count?: number, bytes?: number) {
  if (count === undefined || bytes === undefined) return "—";
  return `${Math.round(count)} · ${formatBytes(bytes)}`;
}

export default function AuroraResourcesPanel() {
  const peak = () => auroraStore.stats(METRIC_KEYS.poolPeak);
  const peakCount = () => auroraStore.stats(METRIC_KEYS.poolPeakCount);
  const pool = () => auroraStore.latestState()?.pool;
  const rows = () =>
    (auroraStore.latestState()?.textures ?? []).map((texture) => [
      texture.name,
      texture.kind,
      texture.format,
      textureSize(texture),
      formatBytes(texture.bytes),
      texture.createdBy,
      texture.usedBy.join(", "),
    ]);

  return (
    <Rows>
      <Block size="fit">
        <StatGrid
          stats={[
            {
              label: "Peak at once",
              value: countAndBytes(peakCount()?.max, peak()?.max),
            },
            {
              label: "Allocated",
              value: countAndBytes(pool()?.allocatedCount, pool()?.allocated),
            },
            {
              label: "Unused 5 s",
              value: countAndBytes(pool()?.unusedCount, pool()?.unused),
            },
          ]}
        />
      </Block>
      <Block size="fill">
        <Table
          columns={[
            { label: "Name", width: "minmax(8rem,1.2fr)" },
            { label: "Kind", width: "auto" },
            { label: "Format", width: "auto" },
            { label: "Size", width: "auto", align: "right" },
            { label: "Memory", width: "auto", align: "right" },
            { label: "Created by" },
            { label: "Used by" },
          ]}
          rows={rows()}
          empty="no textures"
        />
      </Block>
    </Rows>
  );
}
