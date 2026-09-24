import type { IWatchModule, WatchOptions } from "../../interfaces";
import type { WatchInfo, WatchMessage } from "./report";
import { profilerState } from "../../profilerState";
import { serialize } from "../log/serialize";
import { LOG_SCOPE } from "../log/scopes";

const WATCH = {
  intervalMs: 200,
  defaultScope: "Game",
  defaultEditable: true,
};

interface WatchRecord {
  info: WatchInfo;
  getter: (() => unknown) | null;
  // value from set(), only the reference is kept until the next poll
  pushed: unknown;
  lastKey: string;
  force: boolean;
}

export class DevWatch implements IWatchModule {
  private records = new Map<string, WatchRecord>();
  private visible = new Set<string>();
  private frame = 0;
  private lastPoll = -Infinity;

  constructor() {
    let updated = false;
    window.API.DEBUG.onWatchVisible((names) => {
      updated = true;
      this.setVisible(names);
    });
    // a push that arrived first is newer than this answer
    window.API.DEBUG.getWatchVisible().then(
      (names) => !updated && this.setVisible(names),
    );
  }

  public add(name: string, getter: () => unknown, options?: WatchOptions) {
    const record = this.register(name, getter, undefined, options);
    return () => {
      if (this.records.get(name) === record) this.remove(name);
    };
  }

  public set(name: string, value: unknown, options?: WatchOptions) {
    const record = this.records.get(name);
    if (record) record.pushed = value;
    else this.register(name, null, value, options);
  }

  public remove(name: string) {
    if (this.records.delete(name)) this.send({ type: "remove", name });
  }

  public names() {
    return this.records.keys();
  }

  // the current value as console commands see it: getter result or the reference from set()
  public root(name: string) {
    const record = this.records.get(name);
    if (!record) return null;
    return {
      value: () => (record.getter ? record.getter() : record.pushed),
      editable: record.info.editable,
    };
  }

  public endFrame() {
    this.frame++;
    if (!profilerState.isOpen || this.visible.size === 0) return;
    const now = performance.now();
    if (now - this.lastPoll < WATCH.intervalMs) return;
    this.lastPoll = now;
    for (const name of this.visible) {
      const record = this.records.get(name);
      if (record) this.poll(record);
    }
  }

  private register(
    name: string,
    getter: (() => unknown) | null,
    pushed: unknown,
    options: WatchOptions | undefined,
  ) {
    const record: WatchRecord = {
      info: {
        name,
        scope: options?.scope ? LOG_SCOPE[options.scope] : WATCH.defaultScope,
        size: options?.size ?? null,
        editable: options?.editable ?? WATCH.defaultEditable,
      },
      getter,
      pushed,
      lastKey: "",
      force: this.visible.has(name),
    };
    this.records.set(name, record);
    // sent even with the profiler closed, so main knows the registry when it opens
    this.send({ type: "add", watch: record.info });
    if (record.force) this.lastPoll = -Infinity;
    return record;
  }

  private poll(record: WatchRecord) {
    let value = record.pushed;
    let error = false;
    if (record.getter) {
      // a throwing getter must not take the game down, the error becomes the value
      try {
        value = record.getter();
      } catch (thrown) {
        value = thrown;
        error = true;
      }
    }
    const serialized = serialize(value);
    const key = JSON.stringify(serialized) + (error ? "!" : "");
    if (key === record.lastKey && !record.force) return;
    record.lastKey = key;
    record.force = false;
    this.send({
      type: "value",
      name: record.info.name,
      frame: this.frame,
      time: Date.now(),
      value: serialized,
      error,
    });
  }

  private setVisible(names: string[]) {
    const next = new Set(names);
    for (const name of next) {
      if (this.visible.has(name)) continue;
      const record = this.records.get(name);
      if (record) record.force = true;
      this.lastPoll = -Infinity;
    }
    this.visible = next;
  }

  private send(message: WatchMessage) {
    window.API.DEBUG.sendWatch(message);
  }
}

const noop = () => {};
export const prodWatch: IWatchModule = {
  add: () => noop,
  set: noop,
  remove: noop,
  endFrame: noop,
};
