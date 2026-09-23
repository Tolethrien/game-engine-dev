export const LAYOUT_MODES = ["shelf", "skyline", "manual"] as const;
export const LAYOUT_SORTS = ["definition", "size", "name"] as const;

export type LayoutMode = (typeof LAYOUT_MODES)[number];
export type AutoLayoutMode = Exclude<LayoutMode, "manual">;
export type LayoutSort = (typeof LAYOUT_SORTS)[number];

export interface LayoutItem {
  id: string;
  title: string;
  w: number;
  h: number;
}

export interface Cell {
  x: number;
  y: number;
}

export interface Area extends Cell {
  w: number;
  h: number;
}

export type Placement = Map<string, Cell>;

const overlaps = (a: Area, b: Area) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const gridArea = (area: Area) => ({
  "grid-column": `${area.x + 1} / span ${area.w}`,
  "grid-row": `${area.y + 1} / span ${area.h}`,
});

export function sortItems(items: LayoutItem[], sort: LayoutSort) {
  if (sort === "definition") return items;
  const sorted = [...items];
  if (sort === "size") sorted.sort((a, b) => b.h - a.h || b.w - a.w);
  else sorted.sort((a, b) => a.title.localeCompare(b.title));
  return sorted;
}

export function shelf(items: LayoutItem[], columns: number): Placement {
  const placement: Placement = new Map();
  const row = { x: 0, y: 0, height: 0 };

  for (const item of items) {
    if (row.x > 0 && row.x + item.w > columns) {
      row.y += row.height;
      row.x = 0;
      row.height = 0;
    }
    placement.set(item.id, { x: row.x, y: row.y });
    row.x += item.w;
    row.height = Math.max(row.height, item.h);
  }
  return placement;
}

// bottom-left fill; items already in `fixed` keep their cells and only block space
export function skyline(
  items: LayoutItem[],
  columns: number,
  fixed: Placement = new Map(),
): Placement {
  const placement: Placement = new Map(fixed);
  const occupied: boolean[][] = [];

  const isFree = (area: Area) => {
    for (let row = area.y; row < area.y + area.h; row++) {
      for (let column = area.x; column < area.x + area.w; column++) {
        if (occupied[row]?.[column]) return false;
      }
    }
    return true;
  };

  const occupy = (area: Area) => {
    for (let row = area.y; row < area.y + area.h; row++) {
      occupied[row] ??= [];
      for (let column = area.x; column < area.x + area.w; column++) {
        occupied[row][column] = true;
      }
    }
  };

  for (const item of items) {
    const cell = fixed.get(item.id);
    if (cell) occupy({ ...cell, w: item.w, h: item.h });
  }

  for (const item of items) {
    if (placement.has(item.id)) continue;
    // always terminates: rows below everything occupied are empty
    search: for (let y = 0; ; y++) {
      for (let x = 0; x + item.w <= columns; x++) {
        const area = { x, y, w: item.w, h: item.h };
        if (!isFree(area)) continue;
        occupy(area);
        placement.set(item.id, { x, y });
        break search;
      }
    }
  }
  return placement;
}

// saved cells that no longer fit (narrow window, overlap after a size change) are placed
// by skyline for display only, the saved positions stay untouched
export function resolveManual(
  items: LayoutItem[],
  columns: number,
  positions: Record<string, Cell>,
): Placement {
  const fixed: Placement = new Map();
  const kept: Area[] = [];

  for (const item of items) {
    const saved = positions[item.id];
    if (!saved || !Number.isInteger(saved.x) || !Number.isInteger(saved.y)) continue;
    const area = { x: saved.x, y: saved.y, w: item.w, h: item.h };
    if (area.x < 0 || area.y < 0 || area.x + area.w > columns) continue;
    if (kept.some((other) => overlaps(area, other))) continue;
    kept.push(area);
    fixed.set(item.id, { x: area.x, y: area.y });
  }
  return skyline(items, columns, fixed);
}

// react-grid-layout style: the moved item takes the target cell, everything it lands on is
// pushed below it (recursively), then the whole layout is compacted upwards
export function moveItem(
  items: LayoutItem[],
  placement: Placement,
  id: string,
  target: Cell,
): Placement {
  const areas = items.flatMap((item) => {
    const cell = placement.get(item.id);
    return cell ? [{ id: item.id, x: cell.x, y: cell.y, w: item.w, h: item.h }] : [];
  });
  const moved = areas.find((area) => area.id === id);
  if (!moved) return placement;

  moved.x = target.x;
  moved.y = target.y;
  pushDown(moved, moved, areas);
  compact(areas);

  return new Map(areas.map((area) => [area.id, { x: area.x, y: area.y }]));
}

function pushDown(pusher: Area, anchor: Area, areas: Area[]) {
  for (const other of areas) {
    if (other === pusher || other === anchor || !overlaps(pusher, other)) continue;
    other.y = pusher.y + pusher.h;
    pushDown(other, anchor, areas);
  }
}

function compact(areas: Area[]) {
  const ordered = [...areas].sort((a, b) => a.y - b.y || a.x - b.x);
  const settled: Area[] = [];

  for (const area of ordered) {
    while (area.y > 0) {
      const above = { ...area, y: area.y - 1 };
      if (settled.some((other) => overlaps(above, other))) break;
      area.y--;
    }
    settled.push(area);
  }
}
