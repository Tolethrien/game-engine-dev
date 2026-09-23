import { createSignal, type Signal } from "solid-js";
import {
  LAYOUT_MODES,
  LAYOUT_SORTS,
  type Cell,
  type LayoutMode,
  type LayoutSort,
} from "./layouts";

export interface TabLayout {
  mode: LayoutMode;
  sort: LayoutSort;
  positions: Record<string, Cell>;
}

const DEFAULT_LAYOUT: TabLayout = { mode: "shelf", sort: "size", positions: {} };

const storageKey = (tabId: string) => `layout.${tabId}`;

const layouts = new Map<string, Signal<TabLayout>>();

function load(tabId: string): TabLayout {
  try {
    const stored = JSON.parse(
      localStorage.getItem(storageKey(tabId)) ?? "null",
    ) as Partial<TabLayout> | null;
    return {
      mode: (LAYOUT_MODES as readonly unknown[]).includes(stored?.mode)
        ? stored!.mode!
        : DEFAULT_LAYOUT.mode,
      sort: (LAYOUT_SORTS as readonly unknown[]).includes(stored?.sort)
        ? stored!.sort!
        : DEFAULT_LAYOUT.sort,
      positions:
        stored?.positions && typeof stored.positions === "object"
          ? stored.positions
          : {},
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

// written directly instead of through an effect, layouts are created lazily outside any root
export function tabLayout(tabId: string) {
  let entry = layouts.get(tabId);
  if (!entry) {
    entry = createSignal(load(tabId));
    layouts.set(tabId, entry);
  }
  const [layout, setLayout] = entry;

  const update = (patch: Partial<TabLayout>) => {
    const next = { ...layout(), ...patch };
    setLayout(next);
    localStorage.setItem(storageKey(tabId), JSON.stringify(next));
  };

  return { layout, update };
}
