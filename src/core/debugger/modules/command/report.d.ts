import type { PathKey } from "./parse";

export type CommandEntry =
  | { kind: "root"; name: string; hint: string; editable: boolean }
  // options as literal text, e.g. "\"1080\""
  | { kind: "variable"; name: string; hint: string; options: string[] | null }
  | { kind: "action"; name: string; hint: string; params: string };

export type CommandRegistryMessage =
  | { type: "add"; entry: CommandEntry }
  | { type: "remove"; name: string };

export interface CommandMember {
  name: string;
  kind: "field" | "getter" | "method";
  preview: string;
  params: string;
}

export type CommandCompleteQuery =
  | { kind: "members"; path: PathKey[] }
  // from: first array index, ignored for Map
  | { kind: "index"; path: PathKey[]; from: number };

export type CommandCompletion =
  | { kind: "members"; members: CommandMember[] }
  | {
      kind: "array";
      length: number;
      from: number;
      items: { index: number; preview: string }[];
    }
  // skipped: Map keys that cannot be typed as a literal (objects, symbols...)
  | {
      kind: "map";
      size: number;
      skipped: number;
      keys: { key: string | number; preview: string }[];
    };

export interface CommandCompleteRequest {
  id: number;
  query: CommandCompleteQuery;
}

// null = the path does not resolve or is not indexable
export interface CommandCompleteResult {
  id: number;
  completion: CommandCompletion | null;
}
