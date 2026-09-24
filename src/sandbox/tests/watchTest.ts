import { debug } from "@debug";
import Time from "@/core/engine/time";

const WATCH_TEST = {
  scope: "watchTest",
  throwEverySeconds: 3,
  temporaryLifetimeMs: 5000,
  bigArrayLength: 250,
} as const;

const state = {
  frame: 0,
  mover: { position: { x: 0, y: 0 }, velocity: { x: 40, y: 25 }, time: 0 },
};

const constant = {
  name: "static config",
  tags: ["a", "b", "c"],
  nested: { depth: { deeper: { deepest: true } } },
  onHit: (damage: number) => Math.max(0, damage - 3),
};

const big = {
  items: Array.from({ length: WATCH_TEST.bigArrayLength }, (_, index) => ({
    id: index,
    value: index * index,
  })),
  lookup: new Map(
    Array.from({ length: 20 }, (_, index) => [`key${index}`, index]),
  ),
  set: new Set([1, 2, 3]),
  deep: { a: { b: { c: { d: { e: { f: { g: { h: "too deep" } } } } } } } },
};

export function setupWatchTest() {
  const options = { scope: WATCH_TEST.scope };
  debug.watch.add("mover", () => state.mover, { ...options, size: { w: 3, h: 4 } });
  debug.watch.add("constant", () => constant, options);
  debug.watch.add("big", () => big, { ...options, size: { w: 4, h: 5 } });
  debug.watch.add(
    "throwing",
    () => {
      const second = Math.floor(Time.getTimeInSeconds());
      if (second % WATCH_TEST.throwEverySeconds === 0)
        throw new Error(`watch test: getter failed at ${second} s`);
      return { second };
    },
    options,
  );
  const stopTemporary = debug.watch.add(
    "temporary",
    () => ({ removedIn: "5 s" }),
    options,
  );
  setTimeout(stopTemporary, WATCH_TEST.temporaryLifetimeMs);
}

export function watchTest() {
  const seconds = Time.getTimeInSeconds();
  const mover = state.mover;
  mover.time = seconds;
  mover.position.x = Math.round(Math.cos(seconds) * mover.velocity.x);
  mover.position.y = Math.round(Math.sin(seconds) * mover.velocity.y);
  debug.watch.set("frameCounter", state.frame++, { scope: WATCH_TEST.scope });
}
