import { createSignal } from "solid-js";
import { isPanelId, type PanelId } from "./panels/registry";

export interface CustomBoard {
  id: string;
  name: string;
  panels: string[];
}

const BOARDS = {
  storageKey: "customBoards",
  activeKey: "customBoard",
  // single pin list from before boards existed
  legacyPinsKey: "pinnedPanels",
  legacyLayoutKey: "layout.custom",
  defaultName: "Custom",
};

export const boardTabId = (id: string) => `custom:${id}`;

const newBoardId = () => crypto.randomUUID().slice(0, 8);

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function isBoard(value: unknown): value is CustomBoard {
  const board = value as CustomBoard | null;
  return (
    typeof board?.id === "string" &&
    typeof board.name === "string" &&
    Array.isArray(board.panels)
  );
}

// the first run with boards turns the old pins and Custom layout into the first board
function migrate(): CustomBoard[] {
  const legacy = readJson(BOARDS.legacyPinsKey);
  const board: CustomBoard = {
    id: newBoardId(),
    name: BOARDS.defaultName,
    panels: Array.isArray(legacy) ? legacy.filter((id) => typeof id === "string") : [],
  };
  const layout = localStorage.getItem(BOARDS.legacyLayoutKey);
  if (layout) localStorage.setItem(`layout.${boardTabId(board.id)}`, layout);
  localStorage.removeItem(BOARDS.legacyPinsKey);
  localStorage.removeItem(BOARDS.legacyLayoutKey);
  return [board];
}

function load(): CustomBoard[] {
  const stored = readJson(BOARDS.storageKey);
  if (Array.isArray(stored)) {
    const valid = stored.filter(isBoard);
    if (valid.length > 0) return valid;
  }
  const boards = migrate();
  localStorage.setItem(BOARDS.storageKey, JSON.stringify(boards));
  return boards;
}

const [boards, setBoardsSignal] = createSignal<CustomBoard[]>(load());
const [activeId, setActiveIdSignal] = createSignal<string>(
  localStorage.getItem(BOARDS.activeKey) ?? "",
);

// written directly instead of through an effect, this module lives outside any root
function setBoards(next: CustomBoard[]) {
  setBoardsSignal(next);
  localStorage.setItem(BOARDS.storageKey, JSON.stringify(next));
}

export { boards };

export const activeBoard = (): CustomBoard =>
  boards().find((board) => board.id === activeId()) ?? boards()[0];

export function setActiveBoard(id: string) {
  setActiveIdSignal(id);
  localStorage.setItem(BOARDS.activeKey, id);
}

// ids of panels removed from code stay stored, they are only skipped
export const boardPanels = (board: CustomBoard) => board.panels.filter(isPanelId);

export const isPinned = (id: PanelId) =>
  boards().some((board) => board.panels.includes(id));

export const isPinnedTo = (boardId: string, id: PanelId) =>
  boards().some((board) => board.id === boardId && board.panels.includes(id));

export function togglePin(boardId: string, id: PanelId) {
  setBoards(
    boards().map((board) => {
      if (board.id !== boardId) return board;
      const panels = board.panels.includes(id)
        ? board.panels.filter((pinned) => pinned !== id)
        : [...board.panels, id];
      return { ...board, panels };
    }),
  );
}

function uniqueName() {
  const names = new Set(boards().map((board) => board.name));
  for (let index = boards().length + 1; ; index++) {
    const name = `${BOARDS.defaultName} ${index}`;
    if (!names.has(name)) return name;
  }
}

export function addBoard(panels: PanelId[] = []) {
  const board: CustomBoard = { id: newBoardId(), name: uniqueName(), panels };
  setBoards([...boards(), board]);
  return board;
}

export function renameBoard(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  setBoards(boards().map((board) => (board.id === id ? { ...board, name: trimmed } : board)));
}

export function removeBoard(id: string) {
  if (boards().length <= 1) return;
  const wasActive = activeBoard().id === id;
  setBoards(boards().filter((board) => board.id !== id));
  localStorage.removeItem(`layout.${boardTabId(id)}`);
  if (wasActive) setActiveBoard(boards()[0].id);
}
