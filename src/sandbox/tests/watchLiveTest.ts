import { debug } from "@debug";
import Time from "@/core/engine/time";

const LIVE_TEST = {
  scope: "watchLiveTest",
  phaseSeconds: 4,
  spawnEverySeconds: 2,
  maxSpawned: 6,
  maxHistory: 30,
} as const;

const options = { scope: LIVE_TEST.scope };

const state = {
  lastSecond: -1,
  phase: -1,
  spawnCount: 0,
  spawnStops: [] as Array<() => void>,
  spring: { position: 0, velocity: 0, target: 100 },
  history: [] as number[],
  inventory: new Map<string, number>(),
  shapeShifter: null as unknown,
  replaced: { version: 0, payload: { seed: 0 } },
  toggled: false,
};

const SHAPES: Array<() => unknown> = [
  () => 42,
  () => "text value",
  () => ({ x: Math.random(), y: Math.random() }),
  () => [1, 2, 3, Math.round(Math.random() * 10)],
  () => null,
  () => new Set([Math.round(Math.random() * 5), 7]),
];

export function setupWatchLiveTest() {
  debug.watch.add("spring", () => state.spring, { ...options, size: { w: 3, h: 4 } });
  debug.watch.add("history", () => state.history, { ...options, size: { w: 4, h: 5 } });
  debug.watch.add("inventory", () => state.inventory, options);
  debug.watch.add("shapeShifter", () => state.shapeShifter, options);
  debug.watch.add("replacedObject", () => state.replaced, options);
  debug.watch.add("phase", () => ({ phase: state.phase, toggled: state.toggled }), options);
}

export function watchLiveTest() {
  const seconds = Time.getTimeInSeconds();
  const second = Math.floor(seconds);
  const spring = state.spring;

  // spring chases a target that jumps every phase, so the values keep moving
  const delta = 1 / 60;
  spring.velocity += (spring.target - spring.position) * 20 * delta;
  spring.velocity *= 0.92;
  spring.position += spring.velocity * delta;
  debug.watch.set("springEnergy", Math.round(Math.abs(spring.velocity)), options);

  if (second === state.lastSecond) return;
  state.lastSecond = second;

  state.history.push(Math.round(spring.position));
  if (state.history.length > LIVE_TEST.maxHistory) state.history.shift();

  state.inventory.set(`slot${second % 5}`, second);
  if (second % 7 === 0) state.inventory.delete(`slot${(second + 1) % 5}`);

  const phase = Math.floor(seconds / LIVE_TEST.phaseSeconds);
  if (phase !== state.phase) {
    state.phase = phase;
    state.toggled = !state.toggled;
    spring.target = phase % 2 === 0 ? 100 : -100;
    state.shapeShifter = SHAPES[phase % SHAPES.length]();
    // whole new object every phase, not a mutation of the old one
    state.replaced = { version: phase, payload: { seed: Math.round(Math.random() * 1000) } };
  }

  if (second % LIVE_TEST.spawnEverySeconds === 0) spawnOrDespawn();
}

function spawnOrDespawn() {
  if (state.spawnCount < LIVE_TEST.maxSpawned) {
    const index = state.spawnCount++;
    const name = `spawned${index}`;
    const stop = debug.watch.add(
      name,
      () => ({ index, bornAt: state.lastSecond, age: state.lastSecond - index }),
      options,
    );
    state.spawnStops.push(stop);
    return;
  }
  state.spawnStops.forEach((stop) => stop());
  state.spawnStops.length = 0;
  state.spawnCount = 0;
}
