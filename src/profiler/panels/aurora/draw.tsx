import Table from "../../blocks/table";
import { Block, Rows } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import {
  ENCODER_FIELDS,
  ENCODER_TOTAL,
  METRIC_KEYS,
  encoderKey,
} from "@/core/debugger/modules/aurora/keys";
import { formatBytes, formatCount } from "../../format";

const RIGHT = { width: "auto", align: "right" as const };
const ENCODER_COLUMNS = [
  { label: "Category" },
  { label: "Draws", ...RIGHT },
  { label: "Instances", ...RIGHT },
  { label: "Triangles", ...RIGHT },
  { label: "Vertices", ...RIGHT },
  { label: "Pipelines", ...RIGHT },
  { label: "Steps", ...RIGHT },
];
const STAT_COLUMNS = [
  { label: "Category", width: "auto" },
  { label: "Pass stat" },
  { label: "Median", ...RIGHT },
  { label: "Max", ...RIGHT },
];

function categories() {
  const found: string[] = [];
  for (const key of auroraStore.keys()) {
    if (!key.startsWith(METRIC_KEYS.encoder)) continue;
    const category = key.slice(METRIC_KEYS.encoder.length, key.lastIndexOf("."));
    if (category !== ENCODER_TOTAL && !found.includes(category))
      found.push(category);
  }
  return [...found, ENCODER_TOTAL];
}

export default function AuroraDrawPanel() {
  const encoderRows = () =>
    categories().map((category) => [
      category,
      ...ENCODER_FIELDS.map((field) => {
        const median = auroraStore.stats(encoderKey(category, field))?.median;
        return formatCount(median === undefined ? undefined : Math.round(median));
      }),
    ]);

  // "stat:world.opaque" → world | opaque
  const statRows = () => {
    const rows: string[][] = [];
    for (const key of auroraStore.keys()) {
      if (!key.startsWith(METRIC_KEYS.stat)) continue;
      const stats = auroraStore.stats(key);
      if (!stats) continue;
      const path = key.slice(METRIC_KEYS.stat.length);
      const split = path.indexOf(".");
      const name = path.slice(split + 1);
      const format = name.endsWith("Bytes") ? formatBytes : formatCount;
      rows.push([
        path.slice(0, split),
        name,
        format(stats.median),
        format(stats.max),
      ]);
    }
    return rows;
  };

  return (
    <Rows>
      <Block size="fit">
        <Table columns={ENCODER_COLUMNS} rows={encoderRows()} empty="no draw data" />
      </Block>
      <Block size="fill">
        <Table columns={STAT_COLUMNS} rows={statRows()} empty="no pass stats" />
      </Block>
    </Rows>
  );
}
