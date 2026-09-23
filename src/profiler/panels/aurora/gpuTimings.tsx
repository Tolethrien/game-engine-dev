import TreeTable, { type TreeRow } from "../../blocks/treeTable";
import { Block, Rows } from "../../grid/layout";
import { auroraStore } from "../../aurora/store";
import { METRIC_KEYS } from "@/core/debugger/modules/aurora/keys";
import { formatMs } from "../../format";

const RIGHT = { width: "auto", align: "right" as const };
const COLUMNS = [
  { label: "Node" },
  { label: "Med", ...RIGHT },
  { label: "P95", ...RIGHT },
  { label: "Max", ...RIGHT },
  { label: "×/fr", ...RIGHT },
  { label: "% frame", ...RIGHT },
];

// keys keep first-appearance order, a node first seen late still goes under its parent
function orderedPaths() {
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const key of auroraStore.keys()) {
    if (!key.startsWith(METRIC_KEYS.nodeSum)) continue;
    const path = key.slice(METRIC_KEYS.nodeSum.length);
    const split = path.lastIndexOf(":");
    if (split === -1) {
      roots.push(path);
      continue;
    }
    const parent = path.slice(0, split);
    let list = children.get(parent);
    if (!list) children.set(parent, (list = []));
    list.push(path);
  }

  const ordered: { path: string; hasChildren: boolean }[] = [];
  const visit = (path: string) => {
    const list = children.get(path);
    ordered.push({ path, hasChildren: list !== undefined });
    list?.forEach(visit);
  };
  roots.forEach(visit);
  return ordered;
}

function buildRows(): TreeRow[] {
  const frame = auroraStore.stats(METRIC_KEYS.gpuSpan);
  const frames = frame?.count ?? 0;
  const rows: TreeRow[] = [];
  for (const { path, hasChildren } of orderedPaths()) {
    const sum = auroraStore.stats(METRIC_KEYS.nodeSum + path);
    if (!sum) continue;
    const count = hasChildren
      ? undefined
      : auroraStore.stats(METRIC_KEYS.nodeCount + path);
    const segments = path.split(":");
    const presence = frames > 0 ? (sum.count / frames) * 100 : 100;
    const label = segments[segments.length - 1];
    rows.push({
      id: path,
      depth: segments.length - 1,
      hasChildren,
      cells: [
        // presence only when the node skips frames, 100 everywhere said nothing
        presence < 99.5 ? `${label} (in ${presence.toFixed(0)}% frames)` : label,
        formatMs(sum.median, 3),
        formatMs(sum.p95, 3),
        formatMs(sum.max, 3),
        count ? String(count.median) : "",
        frame && frame.median > 0
          ? ((sum.median / frame.median) * 100).toFixed(1)
          : "",
      ],
    });
  }
  return rows;
}

export default function AuroraGpuTimingsPanel() {
  return (
    <Rows>
      <Block size="fill">
        <TreeTable
          storageKey="auroraGpuTimings"
          columns={COLUMNS}
          rows={buildRows()}
          empty="no gpu data"
        />
      </Block>
    </Rows>
  );
}
