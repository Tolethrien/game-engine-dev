import type {
  ICommandModule,
  ILogHandle,
  ITweakModule,
  TweakListSection,
  TweakPanel,
  TweakSection,
} from "../../interfaces";
import type {
  TweakInput,
  TweakMessage,
  TweakPanelInfo,
  TweakSectionInfo,
  TweakValues,
} from "./report";
import { profilerState } from "../../profilerState";
import { formatLiteral } from "../command/parse";
import { assert } from "@axiom/utils";

const TWEAK = {
  intervalMs: 200,
  exportDecimals: 4,
};

type ListItems = Record<string, unknown>[];

// indexes after these point at other elements, so nothing coalesces across them
const STRUCTURAL: ReadonlySet<TweakInput["type"]> = new Set([
  "listAdd",
  "listRemove",
  "listMove",
  "listReplace",
]);

interface TweakRecord {
  panel: TweakPanel;
  info: TweakPanelInfo;
  unregisterCommand: () => void;
}

interface OpenedPanel {
  name: string;
  // cloned: getters may return live references that later edits would change
  snapshot: TweakValues;
  lastKey: string;
}

export class DevTweak implements ITweakModule {
  private records = new Map<string, TweakRecord>();
  // coalesced per name/section/key inside a segment: while dragging a slider only the last value counts;
  // a structural list edit closes the segment
  private pending: Map<string, TweakInput>[] = [new Map()];
  private opened: OpenedPanel | null = null;
  private lastGroupPage = new Map<string, string>();
  private lastPoll = -Infinity;
  private readonly readErrors: ILogHandle;

  constructor(
    private readonly command: ICommandModule,
    private readonly log: ILogHandle,
  ) {
    this.readErrors = log.changed();
    window.API.DEBUG.onTweakInput((input) => {
      const segment = this.pending[this.pending.length - 1];
      const key = inputKey(input);
      // re-inserted, so it keeps its place after a revert that came in between
      segment.delete(key);
      segment.set(key, input);
      if (STRUCTURAL.has(input.type)) this.pending.push(new Map());
    });
  }

  public register(name: string, panel: TweakPanel) {
    for (const section of panel.sections)
      assert(
        section.arg !== "value" || section.fields.length === 1,
        `tweak "${name}": section "${section.title}" has arg "value", it needs exactly one field`,
      );
    this.records.get(name)?.unregisterCommand();
    const info = this.describe(name, panel);
    const record: TweakRecord = {
      panel,
      info,
      unregisterCommand:
        panel.command === false
          ? noop
          : this.command.action(name, () => this.open(name), {
              hint: panel.title,
            }),
    };
    this.records.set(name, record);
    this.send({ type: "add", panel: info });
    // a replaced panel (second URP.init) gets a new snapshot, the old one may not match its sections
    if (this.opened?.name === name) this.open(name);
    return () => {
      if (this.records.get(name) !== record) return;
      record.unregisterCommand();
      this.records.delete(name);
      if (this.opened?.name === name) this.opened = null;
      this.send({ type: "remove", name });
    };
  }

  // edits apply between frames, never in the middle of a game update
  public endFrame() {
    if (this.pending.length > 1 || this.pending[0].size > 0) {
      const segments = this.pending;
      this.pending = [new Map()];
      for (const segment of segments) for (const input of segment.values()) this.apply(input);
    }
    if (!this.opened) return;
    if (!profilerState.isOpen) {
      this.opened = null;
      return;
    }
    const now = performance.now();
    if (now - this.lastPoll < TWEAK.intervalMs) return;
    this.lastPoll = now;
    this.poll(this.opened);
  }

  public open(name: string) {
    if (!profilerState.isOpen) {
      this.log.warn(`"${name}" opens in the profiler, which is closed (openProfiler())`);
      return;
    }
    const record = this.records.get(name);
    if (!record) {
      this.log.warn(`tweak panel "${name}" is not registered`);
      return;
    }
    if (record.info.group !== null) this.lastGroupPage.set(record.info.group, name);
    const values = this.read(record);
    const opened: OpenedPanel = {
      name,
      snapshot: structuredClone(values),
      lastKey: JSON.stringify(values),
    };
    this.opened = opened;
    this.lastPoll = performance.now();
    this.send({ type: "open", name, values });
  }

  public openGroup(group: string) {
    const pages = this.groupRecords(group);
    if (pages.length === 0) {
      this.log.warn(`tweak group "${group}" has no panels`);
      return;
    }
    const last = pages.find((record) => record.info.name === this.lastGroupPage.get(group));
    this.open((last ?? pages[0]).info.name);
  }

  private groupRecords(group: string) {
    return [...this.records.values()]
      .filter((record) => record.info.group === group)
      .sort((a, b) => a.info.order - b.info.order);
  }

  private apply(input: TweakInput) {
    switch (input.type) {
      case "openGroup":
        this.openGroup(input.group);
        return;
      case "exportGroup": {
        const text = this.groupRecords(input.group)
          .filter((record) => record.info.exportable)
          .map((record) => this.export(record, input.onlyChanged))
          .filter((part) => part !== "")
          .join("\n\n");
        this.send({ type: "export", name: input.group, text });
        const kind = input.onlyChanged ? "changed" : "all";
        this.log.log(`${input.group} export (${kind})\n${text}`);
        return;
      }
      case "open":
        this.open(input.name);
        return;
    }
    const record = this.records.get(input.name);
    if (!record) return;
    switch (input.type) {
      case "set": {
        const section = record.panel.sections[input.section];
        if (!section || section.arg === "list") return;
        this.write(input.name, section.title, () =>
          section.set({ [input.key]: input.value }),
        );
        return;
      }
      case "reset": {
        const section = record.panel.sections[input.section];
        if (!section || section.arg === "list") return;
        if (!section.defaults || !(input.key in section.defaults)) return;
        const value = structuredClone(section.defaults[input.key]);
        this.write(input.name, section.title, () => section.set({ [input.key]: value }));
        this.lastPoll = -Infinity;
        return;
      }
      case "revert": {
        const opened = this.opened;
        if (opened?.name !== input.name) return;
        record.panel.sections.forEach((section, index) => {
          if (section.arg === "list") {
            const items = opened.snapshot[index]?.items as ListItems | undefined;
            if (items) this.write(input.name, section.title, () => section.set(structuredClone(items)));
            return;
          }
          const values = structuredClone(opened.snapshot[index]);
          for (const field of section.fields)
            if (field.control.kind === "info") delete values[field.key];
          this.write(input.name, section.title, () => section.set(values));
        });
        this.lastPoll = -Infinity;
        return;
      }
      case "export": {
        const text = this.export(record, input.onlyChanged);
        this.send({ type: "export", name: input.name, text });
        const kind = input.onlyChanged ? "changed" : "all";
        this.log.log(`${input.name} export (${kind})\n${text}`);
        return;
      }
      case "close":
        if (this.opened?.name === input.name) this.opened = null;
        return;
      case "listSet":
        this.editList(record, input.section, (items) => {
          const item = items[input.index];
          if (!item) return false;
          item[input.key] = input.value;
          return true;
        });
        return;
      case "listReset":
        this.editList(record, input.section, (items, section) => {
          const item = items[input.index];
          const created = section.item.create();
          if (!item || !created || !(input.key in created)) return false;
          item[input.key] = created[input.key];
          return true;
        });
        this.lastPoll = -Infinity;
        return;
      case "listAdd":
        this.editList(record, input.section, (items, section) => {
          const created = section.item.create();
          if (!created) return false;
          items.push(created);
          return true;
        });
        this.lastPoll = -Infinity;
        return;
      case "listRemove":
        this.editList(record, input.section, (items) => {
          if (input.index < 0 || input.index >= items.length) return false;
          items.splice(input.index, 1);
          return true;
        });
        this.lastPoll = -Infinity;
        return;
      case "listMove":
        this.editList(record, input.section, (items) => {
          const inRange = (index: number) => index >= 0 && index < items.length;
          if (!inRange(input.from) || !inRange(input.to)) return false;
          const [moved] = items.splice(input.from, 1);
          items.splice(input.to, 0, moved);
          return true;
        });
        this.lastPoll = -Infinity;
        return;
      case "listReplace":
        this.editList(record, input.section, (items) => {
          items.splice(0, items.length, ...structuredClone(input.items));
          return true;
        });
        this.lastPoll = -Infinity;
        return;
    }
  }

  // the game never gets a patch at an index, always the whole new list
  private editList(
    record: TweakRecord,
    sectionIndex: number,
    edit: (items: ListItems, section: TweakListSection) => boolean,
  ) {
    const section = record.panel.sections[sectionIndex];
    if (section?.arg !== "list") return;
    this.write(record.info.name, section.title, () => {
      const items = structuredClone(section.get());
      if (edit(items, section)) section.set(items);
    });
  }

  // an edit from the profiler must never take the game down
  private write(name: string, section: string, set: () => void) {
    try {
      set();
    } catch (error) {
      this.log.error(`${name}: setting "${section}" failed`, error);
    }
  }

  private read(record: TweakRecord): TweakValues {
    return record.panel.sections.map((section) => {
      try {
        if (section.arg === "list") return { items: structuredClone(section.get()) };
        return structuredClone(section.get());
      } catch (error) {
        this.readErrors.error(`${record.info.name}: reading "${section.title}" failed`, error);
        return {};
      }
    });
  }

  private poll(opened: OpenedPanel) {
    const record = this.records.get(opened.name);
    if (!record) return;
    // item fields and labels follow the elements, so a panel with a list is always rebuilt
    if (record.panel.live || record.info.sections.some((section) => section.arg === "list")) {
      const info = this.describe(opened.name, record.panel);
      // the schema goes first, the values may already use its new fields
      if (JSON.stringify(info) !== JSON.stringify(record.info)) {
        record.info = info;
        this.send({ type: "add", panel: info });
      }
    }
    const values = this.read(record);
    const key = JSON.stringify(values);
    if (key === opened.lastKey) return;
    opened.lastKey = key;
    this.send({ type: "values", name: opened.name, values });
  }

  // the full state, not a diff: the game's starting state does not have to be the defaults
  private export(record: TweakRecord, onlyChanged: boolean) {
    const values = this.read(record);
    const lines: string[] = [];
    record.panel.sections.forEach((section, index) => {
      const current = values[index];
      if (section.arg === "list") {
        if (!Array.isArray(current.items)) return;
        const items = roundDeep(current.items) as ListItems;
        if (onlyChanged && JSON.stringify(items) === JSON.stringify(roundDeep(section.defaults)))
          return;
        lines.push(this.formatList(record, section, items));
        return;
      }
      const fields = section.fields.filter(
        (field) =>
          field.control.kind !== "info" &&
          (!onlyChanged ||
          JSON.stringify(roundDeep(current[field.key])) !==
            JSON.stringify(roundDeep(section.defaults?.[field.key]))),
      );
      if (fields.length === 0) return;
      if (section.arg === "value") {
        lines.push(`${section.call}(${formatLiteral(roundDeep(current[fields[0].key]))})`);
        return;
      }
      const ordered = Object.fromEntries(
        fields.map((field) => [field.key, roundDeep(current[field.key])]),
      );
      lines.push(section.format ? section.format(ordered) : `${section.call}(${formatLiteral(ordered)})`);
    });
    return lines.join("\n");
  }

  private formatList(record: TweakRecord, section: TweakListSection, items: ListItems) {
    const fallback = `${section.call}(${formatLiteral(items)})`;
    if (!section.format) return fallback;
    try {
      return section.format(items);
    } catch (error) {
      this.log.error(`${record.info.name}: formatting "${section.title}" failed`, error);
      return fallback;
    }
  }

  private describe(name: string, panel: TweakPanel): TweakPanelInfo {
    return {
      name,
      title: panel.title,
      exportable: panel.exportable ?? true,
      presets: panel.presets ?? true,
      group: panel.group ?? null,
      order: panel.order ?? 0,
      sections: panel.sections.map((section) => this.describeSection(name, section)),
    };
  }

  private describeSection(name: string, section: TweakSection): TweakSectionInfo {
    const { title, call } = section;
    if (section.arg !== "list") return { title, call, arg: section.arg, fields: section.fields };
    try {
      const items = section.get();
      return {
        title,
        call,
        arg: "list",
        itemFields: items.map((item) => section.item.fields(item)),
        itemLabels: items.map((item) => section.item.label?.(item) ?? null),
        addable: section.item.create() !== null,
      };
    } catch (error) {
      this.readErrors.error(`${name}: describing "${title}" failed`, error);
      return { title, call, arg: "list", itemFields: [], itemLabels: [], addable: false };
    }
  }

  private send(message: TweakMessage) {
    window.API.DEBUG.sendTweak(message);
  }
}

function inputKey(input: TweakInput) {
  switch (input.type) {
    case "set":
    case "reset":
      return `${input.type}|${input.name}|${input.section}|${input.key}`;
    case "listSet":
    case "listReset":
      return `${input.type}|${input.name}|${input.section}|${input.index}|${input.key}`;
    case "listAdd":
    case "listRemove":
    case "listMove":
    case "listReplace":
      return `${input.type}|${input.name}|${input.section}`;
    case "openGroup":
    case "exportGroup":
      return `${input.type}|${input.group}`;
    default:
      return `${input.type}|${input.name}`;
  }
}

function roundDeep(value: unknown): unknown {
  if (typeof value === "number") {
    const scale = 10 ** TWEAK.exportDecimals;
    const rounded = Math.round(value * scale) / scale;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(roundDeep);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, roundDeep(item)]),
    );
  return value;
}

const noop = () => {};
export const prodTweak: ITweakModule = {
  register: () => noop,
  open: noop,
  openGroup: noop,
  endFrame: noop,
};
