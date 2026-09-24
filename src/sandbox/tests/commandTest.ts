import { debug } from "@debug";

const COMMAND_TEST = {
  scope: "commandTest",
  loadDelayMs: 1500,
  difficulties: ["easy", "normal", "hard"],
  resolutions: [720, 1080, 1440],
} as const;

const log = debug.log.scope(COMMAND_TEST.scope);

class Stats {
  public hp = 74;
  public maxHp = 100;
  public alive = true;
  private shieldValue = 5;

  public get shield() {
    return this.shieldValue;
  }
  public set shield(value: number) {
    this.shieldValue = Math.max(0, value);
  }
  public get ratio() {
    return this.hp / this.maxHp;
  }
}

class Player {
  public name = "Misa";
  public stats = new Stats();
  public position = { x: 10, y: 20 };
  public inventory = ["sword", "potion", "map"];
  public flags = new Map<string, boolean>([
    ["metKing", true],
    ["sawEnding", false],
  ]);

  public inventoryMap = new Map<unknown, unknown>([
    [
      "sword",
      {
        name: "Iron Sword",
        damage: 12,
        durability: 80,
        equipped: true,
        enchant: { name: "fire", level: 2 },
        tags: ["melee", "metal"],
      },
    ],
    [
      "shield",
      {
        name: "Oak Shield",
        armor: 5,
        durability: 60,
        equipped: false,
        enchant: null,
        tags: ["block"],
      },
    ],
    [3, "three"],
    [{ id: 1 }, "object key"],
  ]);
  public sizeMap = new Map([["size", 42]]);

  public god = false;
  public title: string | null = null;

  // returns an object, so `player.findEnemy("goblin").hp` chains after a call
  public findEnemy(name: string) {
    return { name, hp: 30, position: { x: 1, y: 2 } };
  }
  // a Promise inside an expression is a plain value
  public loadLater() {
    return new Promise((resolve) => setTimeout(() => resolve("loaded"), COMMAND_TEST.loadDelayMs));
  }
  public heal(amount: number) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
    return this.stats.hp;
  }
  public teleport(x: number, y: number) {
    this.position = { x, y };
  }
}

const settings = {
  difficulty: "normal" as (typeof COMMAND_TEST.difficulties)[number],
  speed: 1,
  resolution: 1080,
};

const player = new Player();
const frozen = Object.freeze({ version: 3, build: "dev" });

export function setupCommandTest() {
  const options = { scope: COMMAND_TEST.scope };
  debug.command.expose("player", () => player, { hint: "sandbox player" });
  debug.command.expose("frozen", () => frozen, { hint: "Object.freeze" });
  debug.command.variable("difficulty", {
    get: () => settings.difficulty,
    set: (value) => (settings.difficulty = value),
    options: COMMAND_TEST.difficulties,
    hint: "with options",
  });
  debug.command.variable<number>("speed", {
    get: () => settings.speed,
    set: (value) => (settings.speed = value),
    hint: "without options",
  });
  debug.command.variable<number>("resolution", {
    get: () => settings.resolution,
    set: (value) => (settings.resolution = value),
    options: COMMAND_TEST.resolutions,
    hint: "numeric options",
  });
  debug.command.action(
    "spawn",
    (type: string, count = 1) => {
      log.log(`spawned ${count}× ${type}`);
      return { type, count };
    },
    { hint: "sync action" },
  );
  debug.command.action(
    "load",
    (level: string) =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ level, loaded: true }), COMMAND_TEST.loadDelayMs),
      ),
    { hint: "async action" },
  );
  debug.watch.add("hero", () => player, { ...options, size: { w: 3, h: 4 } });
  debug.watch.add("settings", () => settings, options);
  // a new object every call: editing it would change nothing
  debug.watch.add(
    "heroSummary",
    () => ({ hp: player.stats.hp, position: player.position }),
    { ...options, editable: false },
  );
  log.notify(
    "command test ready, try:\n" +
      [
        "player.stats.hp = 10",
        "hero.heal(20)",
        "difficulty = \"hard\"",
        "difficulty = \"insane\"",
        "speed = 2.5",
        "spawn(\"goblin\", 3)",
        "load(\"forest\")",
        "frozen.version = 4",
        "heroSummary.hp = 1",
        "player.stats.ratio = 1",
        "player.stts",
        "> player.inventory.map(item => item.toUpperCase())",
        "player.stats.hp += 10",
        "player.stats.hp++",
        "player.stats.hp **= 2",
        "player.god = !player.god",
        "player.stats.hp = player.stats.maxHp / 2",
        "player.findEnemy(\"goblin\").hp",
        "player.stats.hp * 2 + 1",
        "player.name + \"!\"",
        "player.name - 1",
        "player.name++",
        "player.title ??= \"Sir\"",
        "resolution = 1000 + 80",
        "resolution = 720 + 720",
        "-2 ** 2",
        "1 ?? 2 || 3",
        "player.findEnemy(\"x\") = 1",
        "player.loadLater()",
      ].join("\n"),
  );
}
