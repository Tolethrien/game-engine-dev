import {
  createEffect,
  createSignal,
  onCleanup,
  type Accessor,
  type Setter,
} from "solid-js";
import type {
  WatchInfo,
  WatchMessage,
  WatchSnapshot,
} from "@/core/debugger/modules/watch/report";

interface WatchEntry {
  info: Accessor<WatchInfo>;
  setInfo: Setter<WatchInfo>;
  snapshot: Accessor<WatchSnapshot | null>;
  setSnapshot: Setter<WatchSnapshot | null>;
}

// one signal pair per watch: a new value re-renders only its own panel
const watches = new Map<string, WatchEntry>();
const [names, setNames] = createSignal<string[]>([]);

const history = {
  ready: false,
  queue: [] as WatchMessage[],
};

// mount count per name; the same watch can be open in two panels at once (tab + Custom)
const visibility = {
  mounted: new Map<string, number>(),
  scheduled: false,
  lastSent: null as string | null,
};

function entry(name: string) {
  names();
  return watches.get(name);
}

function add(info: WatchInfo, snapshot: WatchSnapshot | null) {
  const existing = watches.get(info.name);
  if (existing) {
    existing.setInfo(info);
    if (snapshot) existing.setSnapshot(snapshot);
    return;
  }
  const [infoSignal, setInfo] = createSignal(info);
  const [snapshotSignal, setSnapshot] = createSignal(snapshot);
  watches.set(info.name, {
    info: infoSignal,
    setInfo,
    snapshot: snapshotSignal,
    setSnapshot,
  });
  setNames((previous) => [...previous, info.name]);
}

function apply(message: WatchMessage) {
  switch (message.type) {
    case "add":
      add(message.watch, null);
      return;
    case "remove":
      if (!watches.delete(message.name)) return;
      setNames((previous) => previous.filter((name) => name !== message.name));
      return;
    case "value": {
      const { frame, time, value, error } = message;
      watches.get(message.name)?.setSnapshot({ frame, time, value, error });
      return;
    }
  }
}

function clear() {
  watches.clear();
  setNames([]);
}

function flushVisible() {
  visibility.scheduled = false;
  const visible = [...visibility.mounted.keys()];
  const key = JSON.stringify(visible);
  if (key === visibility.lastSent) return;
  visibility.lastSent = key;
  window.API.DEBUG.setWatchVisible(visible);
}

function scheduleVisible() {
  if (visibility.scheduled) return;
  visibility.scheduled = true;
  // a tab switch unmounts and mounts many panels, they go out as one message
  queueMicrotask(flushVisible);
}

function trackVisible(name: string, active: () => boolean) {
  createEffect(() => {
    if (!active()) return;
    const mounted = visibility.mounted;
    mounted.set(name, (mounted.get(name) ?? 0) + 1);
    scheduleVisible();
    onCleanup(() => {
      const count = (mounted.get(name) ?? 1) - 1;
      if (count > 0) mounted.set(name, count);
      else mounted.delete(name);
      scheduleVisible();
    });
  });
}

window.API.DEBUG.onWatch((message) => {
  if (history.ready) apply(message);
  else history.queue.push(message);
});

// replaying the queue after the state keeps the newest value: everything queued is as new or newer
window.API.DEBUG.getWatchState().then((states) => {
  for (const state of states) add(state.watch, state.value);
  history.queue.forEach(apply);
  history.queue.length = 0;
  history.ready = true;
});

window.API.DEBUG.onGameReloaded(clear);

// main still holds the set of a previous profiler instance after a profiler reload
scheduleVisible();

export const watchStore = {
  names,
  has: (name: string) => entry(name) !== undefined,
  info: (name: string) => entry(name)?.info() ?? null,
  snapshot: (name: string) => entry(name)?.snapshot() ?? null,
  trackVisible,
};
