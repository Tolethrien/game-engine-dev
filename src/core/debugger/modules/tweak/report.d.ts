export type TweakControl =
  | { kind: "slider"; min: number; max: number; step: number }
  | { kind: "number"; step?: number }
  // radians in the game, degrees 0..360 in the UI
  | { kind: "angle" }
  // RGBA 0-255
  | { kind: "color" }
  | { kind: "select"; options: readonly string[] }
  | { kind: "toggle" }
  // Position2D in 0..1
  | { kind: "point" }
  // display only: never edited, left out of exports, revert and presets
  | { kind: "info" };

export interface TweakField {
  key: string;
  label?: string;
  control: TweakControl;
  // release: sent when the control is let go (slider released, number blurred), for settings that rebuild the graph; default live
  apply?: "live" | "release";
}

export interface TweakFieldsSectionInfo {
  title: string;
  call: string;
  // object: setter takes an object of fields, value: the only field's value itself
  arg: "object" | "value";
  fields: TweakField[];
}

// schema computed per current element on the game side, functions do not cross IPC
export interface TweakListSectionInfo {
  title: string;
  call: string;
  arg: "list";
  itemFields: TweakField[][];
  itemLabels: (string | null)[];
  // false when the game has nothing to create
  addable: boolean;
}

export type TweakSectionInfo = TweakFieldsSectionInfo | TweakListSectionInfo;

export interface TweakPanelInfo {
  name: string;
  title: string;
  exportable: boolean;
  presets: boolean;
  group: string | null;
  order: number;
  sections: TweakSectionInfo[];
}

// one record per section, in schema order; list section: { items: [...] }
export type TweakValues = Record<string, unknown>[];

export type TweakMessage =
  | { type: "add"; panel: TweakPanelInfo }
  | { type: "remove"; name: string }
  | { type: "open"; name: string; values: TweakValues }
  | { type: "values"; name: string; values: TweakValues }
  | { type: "export"; name: string; text: string };

// section = index in TweakPanelInfo.sections, index = element of a list section
export type TweakInput =
  | { type: "set"; name: string; section: number; key: string; value: unknown }
  | { type: "reset"; name: string; section: number; key: string }
  | { type: "listSet"; name: string; section: number; index: number; key: string; value: unknown }
  | { type: "listReset"; name: string; section: number; index: number; key: string }
  | { type: "listAdd"; name: string; section: number }
  | { type: "listRemove"; name: string; section: number; index: number }
  | { type: "listMove"; name: string; section: number; from: number; to: number }
  | { type: "listReplace"; name: string; section: number; items: Record<string, unknown>[] }
  | { type: "revert"; name: string }
  | { type: "export"; name: string; onlyChanged: boolean }
  | { type: "close"; name: string }
  | { type: "open"; name: string }
  | { type: "openGroup"; group: string }
  | { type: "exportGroup"; group: string; onlyChanged: boolean };
