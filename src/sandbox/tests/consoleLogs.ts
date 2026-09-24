import { debug } from "@debug";

const log = debug.log.scope("consoleTest");
const handles = {
  throttle: log.throttle(100),
  changed: log.changed(),
  once: log.once(),
  stream: debug.log.scope("stream"),
  fill: debug.log.scope("navi").throttle(1000),
};
const STREAM = { perFrame: 400, frames: 0 };

class Dwarf {
  public inventory = ["kilof", "piwo", "lina"];
  public stats = new Map<string, number>([
    ["siła", 12],
    ["zręczność", 7],
  ]);
  constructor(
    public name: string,
    public position = { x: 120, y: 48 },
  ) {}
  public dig(depth = 1) {
    if (this.inventory.includes("kilof")) {
      this.position.y += depth;
      return true;
    }
    return false;
  }
}

function nested(depth: number): object {
  return depth === 0 ? { bottom: true } : { depth, next: nested(depth - 1) };
}

function everyType() {
  const cycle: Record<string, unknown> = { name: "cykl" };
  cycle.self = cycle;
  const withGetter = { plain: 1 };
  Object.defineProperty(withGetter, "danger", {
    enumerable: true,
    get() {
      throw new Error("getter must never be called");
    },
  });
  const bare = Object.create(null);
  bare.key = "bez prototypu";
  return {
    dwarf: new Dwarf("Gimli"),
    cycle,
    withGetter,
    bare,
    array: Array.from({ length: 150 }, (_, index) => index * 2),
    typed: new Float32Array([0.5, 1.5, 2.5]),
    set: new Set(["a", "b", "c"]),
    date: new Date(),
    error: new Error("przykładowy błąd"),
    fn: function update() {},
    numbers: { nan: NaN, infinity: Infinity, negativeZero: -0 },
    bigint: 12345678901234567890n,
    symbol: Symbol("tag"),
    deep: nested(9),
    longString: "x".repeat(12_000),
  };
}

export const CONSOLE_SCENARIOS: [string, () => void][] = [
  [
    "poziomy",
    () => {
      log.log("zwykły log", 42, true);
      log.success("zapisano grę do slotu", 3);
      log.warn("mało HP:", 12);
      log.error("nie udało się wczytać shadera draw.wgsl");
      log.notify("odblokowano osiągnięcie: Krasnolud z kopalni");
    },
  ],
  [
    "snap",
    () => {
      const player = { hp: 74, position: { x: 1, y: 2 } };
      log.warn("przed zmianą (ma być hp 74):", player);
      player.hp = 0;
      player.position.x = 999;
      log.warn("po zmianie (hp 0, x 999):", player);
    },
  ],
  ["wszystkie typy", () => log.log("typy:", everyType())],
  [
    "kilka obiektów",
    () => log.log("gracz", { hp: 10 }, "wróg", { hp: 30 }, [1, 2, 3]),
  ],
  [
    "funkcje",
    () => {
      log.log("strzałka", (value: number) => value * 2);
      log.log("metoda klasy", new Dwarf("Thorin").dig);
      log.log("klasa", Dwarf);
      log.log("natywna", Math.max);
    },
  ],
  [
    "wieloliniowy",
    () => {
      log.log("linia 1\nlinia 2 (.wgsl)\nlinia 3");
      log.error(new Error("błąd ze stackiem"));
    },
  ],
  [
    "throttle ×1000",
    () => {
      for (let index = 0; index < 1000; index++)
        handles.throttle.log("throttle", index);
    },
  ],
  [
    "changed",
    () => {
      const state = { phase: "idle" };
      for (let index = 0; index < 50; index++) handles.changed.log(state);
      state.phase = "walk";
      handles.changed.log(state);
    },
  ],
  [
    "once",
    () => {
      for (let index = 0; index < 10; index++)
        handles.once.notify("tylko raz", index);
    },
  ],
  [
    "powtórki",
    () => {
      for (let index = 0; index < 20; index++) log.log("identyczna linia");
    },
  ],
  [
    "valve 2000",
    () => {
      for (let index = 0; index < 2000; index++) log.log("spam", index);
      log.error("error przechodzi przez bezpiecznik");
    },
  ],
  [
    "scope'y",
    () => {
      debug.log.scope("demoGpu").warn("pipeline draw:opaque przebudowany");
      debug.log.scope("demoAudio").notify("context resumed");
      debug.log.scope("demoAi").log("krasnolud 7 zmienił cel", { target: "kopalnia" });
      debug.log.scope("demoSave").success("autosave");
      debug.log.log("scope domyślny");
    },
  ],
  [
    "strumień 100k",
    () => {
      STREAM.frames = STREAM.frames > 0 ? 0 : 250;
      log.notify(STREAM.frames > 0 ? "strumień start" : "strumień stop");
    },
  ],
];

export function consoleStartupLogs() {
  debug.log.scope("sandbox").success("navi test gotowy");
  debug.log
    .scope("sandbox")
    .notify("klikaj przyciski w sekcji „konsola” i patrz w profiler");
}

export function consoleFrameLogs(barFill: number) {
  handles.fill.log("wypełnienie pasków", Math.round(barFill * 100), "%");
  if (STREAM.frames <= 0) return;
  STREAM.frames--;
  for (let index = 0; index < STREAM.perFrame; index++)
    handles.stream.log("wiersz strumienia", STREAM.frames, index, {
      value: Math.random(),
    });
}
