import { createEffect } from "solid-js";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { PANELS, type PanelId } from "./panels/registry";

const [storedPins, setStoredPins] = useLocalStorage<string[]>("pinnedPanels", []);

export const pinnedPanels = () =>
  storedPins().filter((id): id is PanelId => id in PANELS);

export const isPinned = (id: PanelId) => storedPins().includes(id);

export function togglePin(id: PanelId) {
  setStoredPins((previous) =>
    previous.includes(id)
      ? previous.filter((pinned) => pinned !== id)
      : [...previous, id],
  );
}

// drops ids of panels that no longer exist in code
createEffect(() => {
  if (pinnedPanels().length !== storedPins().length) {
    setStoredPins(pinnedPanels());
  }
});
