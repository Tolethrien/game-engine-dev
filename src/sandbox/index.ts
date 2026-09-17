import Engine from "@engine/engine";
import FPSOverlay from "@engine/fpsOverlay";
import Aurora from "@/core/aurora2/core";
import land from "@sandbox/assets/land.png";
import testGrid from "@sandbox/assets/fonts/testGrid/testGrid.png";
import latoRegular from "@sandbox/assets/fonts/lato/Lato-Regular.ttf";
import latoBold from "@sandbox/assets/fonts/lato/Lato-Bold.ttf";
import latoItalic from "@sandbox/assets/fonts/lato/Lato-Italic.ttf";
import medievalSharp from "@sandbox/assets/fonts/medievalSharp/MedievalSharp-Regular.ttf";
import blackOps from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.ttf";
import latoSdfImage from "@sandbox/assets/fonts/lato/Lato-Regular.mtsdf.png";
import latoSdfJson from "@sandbox/assets/fonts/lato/Lato-Regular.mtsdf.json";
import blackOpsSdfImage from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.mtsdf.png";
import blackOpsSdfJson from "@sandbox/assets/fonts/blackOpsOne/BlackOpsOne-Regular.mtsdf.json";
import { Draw, DrawGui } from "@/core/aurora2/urp/draw";
import TextBox from "@/core/aurora2/text/textBox";
import TextLayout from "@/core/aurora2/text/textLayout";
import Time from "@/core/engine/time";
import URP, { SortMode, URPSortConfig } from "@/core/aurora2/urp/urp";
import Material from "@/core/aurora2/material";
import { MaterialParams } from "@/core/aurora2/urp/draw";
import { COLOR } from "@/core/axiom/color";
import AxiomMath from "@axiom/math";
import laserElectric from "@/core/aurora2/urp/shaders/materials/laserElectric.wgsl?raw";
import laserPulse from "@/core/aurora2/urp/shaders/materials/laserPulse.wgsl?raw";
import laserPlasma from "@/core/aurora2/urp/shaders/materials/laserPlasma.wgsl?raw";
import laserTracer from "@/core/aurora2/urp/shaders/materials/laserTracer.wgsl?raw";
import glowOrb from "@/core/aurora2/urp/shaders/materials/glowOrb.wgsl?raw";
import textRainbow from "@/core/aurora2/urp/shaders/materials/textRainbow.wgsl?raw";
import textGlow from "@/core/aurora2/urp/shaders/materials/textGlow.wgsl?raw";
import InputManager from "@/core/engine/inputManager";
import { KEY } from "@/core/engine/keys";

// params: x = intensity, y = speed, z = effect specific, w = seed
const LASER_ELECTRIC = Material.create({
  name: "laserElectric",
  blend: "additive",
  fragment: laserElectric,
});
const LASER_PULSE = Material.create({
  name: "laserPulse",
  blend: "additive",
  fragment: laserPulse,
});
const LASER_PLASMA = Material.create({
  name: "laserPlasma",
  blend: "additive",
  fragment: laserPlasma,
});
const LASER_TRACER = Material.create({
  name: "laserTracer",
  blend: "additive",
  fragment: laserTracer,
});
const GLOW_ORB = Material.create({
  name: "glowOrb",
  blend: "additive",
  fragment: glowOrb,
});
const TEXT_GLOW = Material.create({
  name: "textGlow",
  fragment: textGlow,
  transparent: true,
});
const TEXT_RAINBOW = Material.create({
  name: "textRainbow",
  fragment: textRainbow,
});

const FAN_COLORS: RGBA[] = [
  COLOR.CYAN,
  COLOR.MAGENTA,
  COLOR.GOLD,
  COLOR.LIME,
  COLOR.DODGER_BLUE,
  COLOR.HOT_PINK,
];
const FAN_PARAMS: MaterialParams[] = FAN_COLORS.map((_, i) => [
  1.1,
  0.8 + i * 0.35,
  0,
  i * 3.7,
]);
const PULSE_PARAMS: MaterialParams = [1.3, 1.5, 90, 0];
const PLASMA_PARAMS: MaterialParams = [1.0, 1.0, 0, 2.0];
const SORT_MODES: SortMode[] = ["none", "y", "layer", "y+x", "y+x+z"];
const SORT_CONFIG: URPSortConfig = {
  mode: "y+x+z",
  anchor: "bottom",
  step: { y: 2, x: 32, z: 1 },
  zRange: [0, 255],
};
let sortModeIndex = SORT_MODES.indexOf(SORT_CONFIG.mode);
interface Bullet {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speed: number;
  color: RGBA;
}
const BULLET_ORIGIN = { x: 960, y: 1080, z: 0 };
const BULLET_LENGTH = 140;
const BULLET_RATE = 14;
const BULLET_COLORS: RGBA[] = [
  COLOR.CRIMSON,
  COLOR.AQUAMARINE,
  COLOR.GOLD,
  COLOR.HOT_PINK,
  COLOR.CYAN,
];
// soft copies for the transparent row of the sort test
const SOFT_RED: RGBA = [220, 20, 60, 200];
const SOFT_BLUE: RGBA = [30, 144, 255, 200];
const SOFT_GREEN: RGBA = [50, 205, 50, 200];
const SOFT_CYAN: RGBA = [0, 255, 255, 170];

// center x, bottom, width, height, z, color
type SortBox = [number, number, number, number, number, RGBA];
// no scrolling, one dash as long as the bullet: bright head, fading tail
const BULLET_PARAMS: MaterialParams = [1.4, 0, BULLET_LENGTH, 0];
const bullets: Bullet[] = [];
let bulletTimer = 0;
const ORB_CENTER: MaterialParams = [1.2, 3.0, 0, 0];
const ORB_SMALL: MaterialParams = [1.0, 5.0, 0, 1.5];
const PILLARS = [
  { x: 260, bottom: 420, color: [200, 70, 70, 255] as RGBA },
  { x: 520, bottom: 560, color: [70, 170, 90, 255] as RGBA },
  { x: 780, bottom: 700, color: [70, 110, 210, 255] as RGBA },
  { x: 1040, bottom: 840, color: [210, 170, 60, 255] as RGBA },
  { x: 1300, bottom: 980, color: [160, 80, 200, 255] as RGBA },
];
const PILLAR_WIDTH = 160;
const PILLAR_HEIGHT = 360;

async function preload() {
  await Aurora.config({
    rendering: {
      transparentCanvas: false,
      canvasColor: COLOR.BLACK,
      renderRes: "1920x1080",
      normalMaps: false,
      heightMaps: false,
      computeGroupSize: 16,
      colorSpace: "linear",
    },

    userTextures: [{ name: "land", albedo: land }],
    userUI: [{ name: "landUI", url: land }],
    fonts: [
      {
        name: "testGrid",
        type: "grid",
        url: testGrid,
        cell: GRID_CELL,
        chars: GRID_CHARS,
        baseline: 25,
      },
      { name: "lato", type: "dynamic", url: latoRegular },
      { name: "latoBold", type: "dynamic", url: latoBold },
      { name: "latoItalic", type: "dynamic", url: latoItalic },
      { name: "medieval", type: "dynamic", url: medievalSharp },
      { name: "blackOps", type: "dynamic", url: blackOps },
      {
        name: "latoSdf",
        type: "mtsdf",
        url: latoSdfImage,
        json: latoSdfJson,
      },
      {
        name: "blackOpsSdf",
        type: "mtsdf",
        url: blackOpsSdfImage,
        json: blackOpsSdfJson,
      },
    ],
  });

  await URP.init({ sort: SORT_CONFIG });
  FPSOverlay.setVisible(true);
}

function setup() {}
function update() {
  if (InputManager.isKeyPressed(KEY.m)) {
    sortModeIndex = (sortModeIndex + 1) % SORT_MODES.length;
    const mode = SORT_MODES[sortModeIndex];
    console.log(`sort mode: ${mode}`);
    void URP.init({ sort: { ...SORT_CONFIG, mode } });
  }
  Draw.beginFrame();
  DrawGui.beginFrame();
  const t = Time.getTimeInSeconds();
  // pilarsTest(t);
  // lasersTest(t);
  // sortTest(t);
  // quadTest(t);
  // guiTest(t);
  textShowcase(t);
}

//=============================== text showcase
// world: six cards in a 3x2 grid, each shows one part of the text system
// gui: a panel on the right side of the canvas with dynamic fonts

// testGrid.png is 16 columns of 16x30 cells, ascii 32..126 then polish letters
const GRID_CHARS =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") +
  "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ";
const GRID_CELL = { width: 16, height: 30 };

const CARD = { width: 400, height: 500, gap: 24, left: 30, top: 30 };
const CARD_BACKGROUND: RGBA = [24, 26, 36, 255];
const CARD_BORDER: RGBA = [62, 66, 90, 255];
const MUTED: RGBA = [140, 146, 170, 255];
const GUIDE: RGBA = [255, 90, 90, 150];

const QUEST_TEXT =
  "The old lighthouse keeper asks you to bring back the lantern oil " +
  "stolen by smugglers hiding in the caves north of the harbour.";

const ALIGN_BOXES = (["start", "center", "end"] as const).map(
  (align) =>
    new TextBox({
      font: "lato",
      size: 18,
      width: 360,
      align,
      text: `align ${align}`,
    }),
);
const JUSTIFY_BOX = new TextBox({
  font: "lato",
  size: 16,
  align: "justify",
  lineGap: 3,
  text: QUEST_TEXT,
});
const CENTER_WRAP_BOX = new TextBox({
  font: "lato",
  size: 16,
  width: 360,
  align: "center",
  lineGap: 3,
  text: "Centered lines wrap on words and every line is centered on its own",
});
const JUSTIFY_FIXED_BOX = new TextBox({
  font: "lato",
  size: 16,
  width: 360,
  align: "justify",
  justifyLast: "center",
  lineGap: 3,
  text: QUEST_TEXT,
});
const ELLIPSIS_BOX = new TextBox({
  font: "lato",
  size: 17,
  width: 360,
  height: 44,
  lineGap: 2,
  overflow: "ellipsis",
  text: QUEST_TEXT,
});
const ITEM_BOX = new TextBox({
  font: "latoBold",
  size: 18,
  width: 360,
  overflow: "ellipsis",
  wrap: false,
  text: "Ancient Lantern of the Drowned Lighthouse Keeper",
});
const TAVERN_NAMES = [
  "Inn",
  "The Rusty Anchor",
  "The Rusty Anchor Tavern and Stables of the North Road",
];
const SIGN_WRAP_BOX = new TextBox({
  font: "medieval",
  size: 34,
  width: 360,
  height: 50,
  align: "center",
  alignCross: "center",
  overflow: "fit",
});
const SIGN_LINE_BOX = new TextBox({
  font: "medieval",
  size: 34,
  width: 360,
  height: 50,
  align: "center",
  alignCross: "center",
  overflow: "fit",
  wrap: false,
});
const COLUMN_BOX = new TextBox({
  font: "latoBold",
  size: 20,
  direction: "col",
  height: 190,
  lineGap: 8,
  text: "SCROLL OF THE EAST",
});
const LOG_BOX = new TextBox({
  font: "lato",
  size: 15,
  width: 360,
  height: 150,
  lineGap: 2,
  alignCross: "end",
  overflow: "tail",
});
const LOG_EVENTS = [
  "You picked up 12 gold",
  "Smuggler hits you for 7",
  "You cast Firebolt",
  "Smuggler is burning",
  "Door unlocked",
  "Quest updated: Lantern Oil",
];

const PANEL_WIDTH = 480;
const PANEL_PARAGRAPH = new TextBox({
  font: "lato",
  size: 15,
  width: PANEL_WIDTH - 40,
  align: "justify",
  lineGap: 3,
  text:
    "Glyphs of dynamic fonts are drawn by the browser the first time they " +
    "are used and copied into the atlas. Every whole pixel size has its own " +
    "glyphs, so small interface text stays as sharp as system text.",
});
const PANEL_BUTTON = new TextBox({
  font: "blackOps",
  size: 22,
  width: 200,
  height: 44,
  align: "center",
  alignCross: "center",
  text: "START",
});
const PANEL_TITLE = new TextBox({
  font: "blackOps",
  size: 34,
  width: PANEL_WIDTH - 40,
  height: 40,
  alignCross: "center",
  overflow: "fit",
  wrap: false,
});

function textShowcase(t: number) {
  const cards: [string, string, (x: number, y: number) => void][] = [
    ["Font types", "bitmap, raster and mtsdf", (x, y) => fontsCard(x, y, t)],
    ["Alignment", "TextBox align and justify", (x, y) => alignCard(x, y, t)],
    ["Overflow", "ellipsis and fit", (x, y) => overflowCard(x, y, t)],
    ["Sorting", "one sort point per text", (x, y) => sortingCard(x, y, t)],
    ["Materials", "custom shader and alpha", materialCard],
    [
      "Columns and log",
      "col direction, tail overflow",
      (x, y) => logCard(x, y, t),
    ],
  ];
  cards.forEach(([title, subtitle, content], i) => {
    const x = CARD.left + (i % 3) * (CARD.width + CARD.gap);
    const y = CARD.top + Math.floor(i / 3) * (CARD.height + CARD.gap);
    card(x, y, title, subtitle);
    content(x + 20, y + 76);
  });
  guiPanel(t);
}

function card(x: number, y: number, title: string, subtitle: string) {
  // sorts by its top edge, so everything drawn inside stays in front of it
  Draw.rect({
    position: { x, y, z: 0 },
    size: { width: CARD.width, height: CARD.height },
    color: CARD_BACKGROUND,
    outline: { width: 2, color: CARD_BORDER },
    rounded: 14,
    sort: { x: x + CARD.width / 2, y, z: 0 },
  });
  Draw.text({
    position: { x: x + 20, y: y + 16, z: 0 },
    font: "latoBold",
    text: title,
    size: 24,
  });
  Draw.text({
    position: { x: x + 20, y: y + 46, z: 0 },
    font: "lato",
    text: subtitle,
    size: 15,
    color: MUTED,
  });
}

function label(x: number, y: number, text: string) {
  Draw.text({
    position: { x, y, z: 0 },
    font: "lato",
    text,
    size: 13,
    color: MUTED,
  });
}

function frame(box: TextBox, x: number, y: number) {
  Draw.rect({
    position: { x, y, z: 0 },
    size: box.getSize,
    color: COLOR.TRANSPARENT,
    outline: { width: 1, color: GUIDE },
  });
}

function fontsCard(x: number, y: number, t: number) {
  const samples: [string, string, RGBA][] = [
    ["testGrid", "bitmap png, 1:1", COLOR.GOLD],
    ["lato", "ttf rasterized per size", COLOR.WHITE],
    ["latoSdf", "mtsdf, any size", COLOR.SKY_BLUE],
  ];
  let row = y;
  for (const [font, note, color] of samples) {
    label(x, row, note);
    Draw.text({
      position: { x, y: row + 16, z: 0 },
      font,
      text: "Zażółć gęślą 30",
      size: 30,
      color,
    });
    row += 62;
  }

  label(x, row, "mtsdf with the glow material");
  Draw.text({
    position: { x, y: row + 18, z: 0 },
    font: "latoSdf",
    text: "Neon",
    size: 54,
    color: COLOR.HOT_PINK,
    material: TEXT_GLOW,
    params: [7, 0.5, 0.6, 0],
  });
  row += 84;

  // the whole usable range, from unreadable to huge: mtsdf scales smoothly and
  // keeps its edge, the outline grows with the text
  const size = 4 + ((Math.sin(t * 0.5) + 1) / 2) * 106;
  label(x, row, `mtsdf from 4 to 110 px, now ${size.toFixed(1)} px`);
  Draw.text({
    position: { x, y: row + 18, z: 0 },
    font: "blackOpsSdf",
    text: "Aa",
    size,
    color: COLOR.GOLD,
    outline: { width: Math.max(1, size * 0.05), color: COLOR.BLACK },
  });
  // the same sizes in the raster font, for comparison
  Draw.text({
    position: { x: x + 150, y: row + 18, z: 0 },
    font: "blackOps",
    text: "Aa",
    size,
    color: COLOR.SKY_BLUE,
  });
}

function alignCard(x: number, y: number, t: number) {
  ALIGN_BOXES.forEach((box, i) => {
    const boxY = y + i * 30;
    frame(box, x, boxY);
    Draw.textBox(box, { position: { x, y: boxY, z: 0 } });
  });

  label(x, y + 94, "center, wrapped");
  frame(CENTER_WRAP_BOX, x, y + 112);
  Draw.textBox(CENTER_WRAP_BOX, { position: { x, y: y + 112, z: 0 } });

  label(x, y + 166, "justify, fixed width, last line centered");
  frame(JUSTIFY_FIXED_BOX, x, y + 184);
  Draw.textBox(JUSTIFY_FIXED_BOX, { position: { x, y: y + 184, z: 0 } });

  label(x, y + 256, "justify, width follows the time");
  JUSTIFY_BOX.set({ width: Math.round(290 + Math.sin(t * 0.8) * 70) });
  frame(JUSTIFY_BOX, x, y + 274);
  Draw.textBox(JUSTIFY_BOX, { position: { x, y: y + 274, z: 0 } });
}

function overflowCard(x: number, y: number, t: number) {
  label(x, y, "ellipsis, two lines");
  frame(ELLIPSIS_BOX, x, y + 18);
  Draw.textBox(ELLIPSIS_BOX, { position: { x, y: y + 18, z: 0 } });

  label(x, y + 76, "ellipsis, one line");
  frame(ITEM_BOX, x, y + 94);
  Draw.textBox(ITEM_BOX, {
    position: { x, y: y + 94, z: 0 },
    color: COLOR.GOLD,
  });

  const name = TAVERN_NAMES[Math.floor(t / 2) % TAVERN_NAMES.length];
  label(x, y + 140, "fit, wraps then shrinks");
  SIGN_WRAP_BOX.set({ text: name });
  frame(SIGN_WRAP_BOX, x, y + 158);
  Draw.textBox(SIGN_WRAP_BOX, {
    position: { x, y: y + 158, z: 0 },
    color: COLOR.PEACH,
  });

  label(x, y + 224, "fit, one line");
  SIGN_LINE_BOX.set({ text: name });
  frame(SIGN_LINE_BOX, x, y + 242);
  Draw.textBox(SIGN_LINE_BOX, {
    position: { x, y: y + 242, z: 0 },
    color: COLOR.PEACH,
  });
}

function sortingCard(x: number, y: number, t: number) {
  // a sign on the ground, the crate slides along the same bottom line:
  // it is all in front of or all behind the sign, never between letters
  const signBottom = y + 70;
  Draw.text({
    position: { x, y: signBottom - 44, z: 0 },
    font: "latoBold",
    text: "GENERAL STORE",
    size: 36,
    color: COLOR.GOLD,
  });
  Draw.rect({
    position: {
      x: x + ((Math.sin(t * 0.7) + 1) / 2) * 300,
      y: signBottom - 64,
      z: 0,
    },
    size: { width: 60, height: 64 },
    color: COLOR.TAN,
    outline: { width: 3, color: COLOR.BROWN },
  });

  // a lamp post on y 330, labels sort by the feet of their walker
  const postX = x + 170;
  const postBottom = y + 330;
  Draw.rect({
    position: { x: postX, y: postBottom - 250, z: 0 },
    size: { width: 20, height: 250 },
    color: [110, 116, 130, 255],
  });
  const walkers: [string, number, number, RGBA][] = [
    ["in front", postBottom + 40, 0, COLOR.LIME],
    ["behind", postBottom - 40, Math.PI, COLOR.TOMATO],
  ];
  for (const [text, feet, phase, color] of walkers) {
    const walkerX = x + 30 + ((Math.sin(t * 0.5 + phase) + 1) / 2) * 300;
    const sort = { x: walkerX, y: feet, z: 0 };
    Draw.circle({
      position: { x: walkerX, y: feet - 22, z: 0 },
      radius: 22,
      color,
      sort,
    });
    const size = TextLayout.measure("latoBold", text, 20);
    Draw.text({
      position: { x: walkerX - size.width / 2, y: feet - 82, z: 0 },
      font: "latoBold",
      text,
      size: 20,
      color,
      sort,
    });
  }
}

function materialCard(x: number, y: number) {
  label(x, y, "uvScope glyph: the pattern repeats in every letter");
  Draw.text({
    position: { x, y: y + 18, z: 0 },
    font: "blackOps",
    text: "RAINBOW",
    size: 48,
    material: TEXT_RAINBOW,
    params: [0.4, 1, 0, 0],
  });
  label(x, y + 86, "uvScope text: one pattern across the whole text");
  Draw.text({
    position: { x, y: y + 104, z: 0 },
    font: "blackOps",
    text: "RAINBOW",
    size: 48,
    material: TEXT_RAINBOW,
    params: [0.4, 1, 0, 0],
    uvScope: "text",
  });

  // ghost text, bottom at y + 280: the left crate ends above it (behind, seen
  // through the letters), the right crate ends below it (in front, covers them)
  label(x, y + 190, "alpha 60: behind and in front");
  const textY = y + 220;
  const bottom = textY + TextLayout.measure("blackOps", "GHOST", 56).height;
  Draw.rect({
    position: { x: x + 10, y: textY + 10, z: 0 },
    size: { width: 110, height: bottom - textY - 20 },
    color: COLOR.DODGER_BLUE,
  });
  Draw.rect({
    position: { x: x + 140, y: textY + 10, z: 0 },
    size: { width: 110, height: bottom - textY },
    color: COLOR.DODGER_BLUE,
  });
  Draw.text({
    position: { x, y: textY, z: 0 },
    font: "blackOps",
    text: "GHOST",
    size: 56,
    color: [255, 255, 255, 60],
  });

  label(x, y + 300, "outline grows outwards, drawn under all letters");
  Draw.text({
    position: { x, y: y + 318, z: 0 },
    font: "blackOps",
    text: "OUTLINE",
    size: 40,
    color: COLOR.GOLD,
    outline: { width: 4, color: COLOR.BLACK },
  });
  Draw.text({
    position: { x: x + 230, y: y + 330, z: 0 },
    font: "testGrid",
    text: "PIXEL",
    size: 30,
    outline: { width: 2, color: COLOR.DODGER_BLUE },
  });
}

function logCard(x: number, y: number, t: number) {
  frame(COLUMN_BOX, x, y);
  Draw.textBox(COLUMN_BOX, { position: { x, y, z: 0 }, color: COLOR.SKY_BLUE });

  label(x, y + 212, "tail: only the newest lines stay");
  const count = Math.floor(t * 1.5);
  let log = "";
  for (let i = Math.max(0, count - 10); i <= count; i++) {
    log += `${log ? "\n" : ""}${LOG_EVENTS[i % LOG_EVENTS.length]}`;
  }
  LOG_BOX.set({ text: log });
  frame(LOG_BOX, x, y + 232);
  Draw.textBox(LOG_BOX, { position: { x, y: y + 232, z: 0 } });
}

function guiPanel(t: number) {
  const panelX = Aurora.canvas.width - PANEL_WIDTH - 20;
  const x = panelX + 20;
  DrawGui.rect({
    position: { x: panelX, y: 20, z: 0 },
    size: { width: PANEL_WIDTH, height: Aurora.canvas.height - 40 },
    color: [16, 17, 24, 240],
    outline: { width: 2, color: CARD_BORDER },
    rounded: 14,
  });
  DrawGui.text({
    position: { x, y: 36, z: 0 },
    font: "latoBold",
    text: "Dynamic fonts",
    size: 24,
  });
  DrawGui.text({
    position: { x, y: 66, z: 0 },
    font: "lato",
    text: "gui pass, canvas pixels, rasterized per size",
    size: 14,
    color: MUTED,
  });

  let y = 100;
  for (const size of [9, 10, 11, 12, 13, 14, 16, 18, 22]) {
    DrawGui.text({
      position: { x, y, z: 0 },
      font: "lato",
      text: `${size}px  Zażółć gęślą jaźń 0123456789`,
      size,
    });
    y += size + 7;
  }
  DrawGui.text({
    position: { x, y, z: 0 },
    font: "lato",
    text: "14.6px and 15.4px both round to 15px",
    size: 15,
    color: COLOR.SKY_BLUE,
  });
  y += 32;

  const styles: [string, string, number, RGBA][] = [
    ["latoBold", "Lato Bold", 22, COLOR.WHITE],
    ["latoItalic", "Lato Italic", 22, COLOR.WHITE],
    ["medieval", "MedievalSharp, the Rusty Anchor", 28, COLOR.PEACH],
    ["blackOps", "BLACK OPS ONE", 28, COLOR.GOLD],
  ];
  for (const [font, text, size, color] of styles) {
    DrawGui.text({ position: { x, y, z: 0 }, font, text, size, color });
    y += size + 10;
  }

  // letter spacing: fixed and breathing, the frame comes from measure
  DrawGui.text({
    position: { x, y, z: 0 },
    font: "latoBold",
    text: "CHAPTER ONE",
    size: 18,
    letterSpacing: 8,
    color: MUTED,
  });
  y += 30;
  const spacing = Math.round(3 + Math.sin(t * 1.5) * 5);
  const spaced = TextLayout.measure("blackOps", "SPACING", 26, spacing);
  DrawGui.rect({
    position: { x, y, z: 0 },
    size: spaced,
    color: COLOR.TRANSPARENT,
    outline: { width: 1, color: GUIDE },
  });
  DrawGui.text({
    position: { x, y, z: 0 },
    font: "blackOps",
    text: "SPACING",
    size: 26,
    letterSpacing: spacing,
    color: COLOR.GOLD,
  });
  y += 40;

  DrawGui.text({
    position: { x, y, z: 0 },
    font: "latoBold",
    text: "Outlined interface text",
    size: 24,
    outline: { width: 2, color: COLOR.BLACK },
    color: COLOR.WHITE,
  });
  DrawGui.text({
    position: { x: x + 300, y: y - 4, z: 0 },
    font: "blackOps",
    text: "GLOW",
    size: 32,
    color: COLOR.CYAN,
    material: TEXT_GLOW,
    params: [7 + Math.sin(t * 2), 0.45, 0.6, 0],
  });
  y += 44;

  // png grid font with the same effects as ttf ones
  DrawGui.text({
    position: { x, y, z: 0 },
    font: "testGrid",
    text: "PIXEL",
    size: 60,
    color: COLOR.YELLOW,
    outline: { width: 5, color: COLOR.MAGENTA },
  });
  DrawGui.text({
    position: { x: x + 220, y, z: 0 },
    font: "testGrid",
    text: "NEON",
    size: 60,
    color: COLOR.HOT_PINK,
    material: TEXT_GLOW,
    params: [8, 0.55, 0.6, 0],
  });
  y += 76;
  y += 8;

  DrawGui.textBox(PANEL_PARAGRAPH, {
    position: { x, y, z: 0 },
    color: [210, 214, 228, 255],
  });
  y += PANEL_PARAGRAPH.getSize.height + 24;

  // button: draw scale pulses around its center, the layout never changes
  const pulse = 1 + Math.sin(t * 4) * 0.06;
  const button = PANEL_BUTTON.getSize;
  const centerX = x + button.width / 2;
  const centerY = y + button.height / 2;
  const scaled = { width: button.width * pulse, height: button.height * pulse };
  const buttonPosition = {
    x: centerX - scaled.width / 2,
    y: centerY - scaled.height / 2,
    z: 0,
  };
  DrawGui.rect({
    position: buttonPosition,
    size: scaled,
    color: [40, 120, 70, 255],
    outline: { width: 2, color: COLOR.LIME },
    rounded: 10,
  });
  DrawGui.textBox(PANEL_BUTTON, { position: buttonPosition, scale: pulse });
  DrawGui.text({
    position: { x: x + 220, y: y + 14, z: 0 },
    font: "lato",
    text: "draw time scale",
    size: 14,
    color: MUTED,
  });
  y += button.height + 24;

  const titles = ["VICTORY", "MISSION COMPLETE: HARBOUR SECURED"];
  PANEL_TITLE.set({ text: titles[Math.floor(t / 2) % titles.length] });
  DrawGui.textBox(PANEL_TITLE, { position: { x, y, z: 0 }, color: COLOR.GOLD });
}

function guiTest(t: number) {
  // canvas pixels, ignores the camera, always on top of the world
  DrawGui.rect({
    position: { x: 24, y: 24, z: 0 },
    size: { width: 320, height: 120 },
    color: [20, 20, 30, 200],
    rounded: 12,
    outline: { width: 2, color: COLOR.SKY_BLUE },
  });
  const fill = (Math.sin(t) + 1) / 2;
  DrawGui.rect({
    position: { x: 44, y: 100, z: 0 },
    size: { width: 280 * fill, height: 20 },
    color: COLOR.LIME,
    rounded: 6,
  });
  DrawGui.circle({
    position: { x: 290, y: 60, z: 0 },
    radius: 22,
    color: COLOR.GOLD,
    material: GLOW_ORB,
    params: ORB_SMALL,
  });
  DrawGui.sprite({
    position: { x: 24, y: 170, z: 0 },
    texture: "landUI",
    size: { width: 176, height: 176 },
    crop: { x: 0, y: 0, width: 44, height: 44 },
    outline: { width: 2, color: COLOR.SKY_BLUE },
  });

  // gui sprite from userTextures, same image taken from the world atlas
  DrawGui.sprite({
    position: { x: 224, y: 170, z: 0 },
    texture: "land",
    atlas: "world",
    size: { width: 176, height: 176 },
    crop: { x: 44, y: 0, width: 44, height: 44 },
    rotation: t * 0.5,
    outline: { width: 2, color: COLOR.GOLD },
  });
}

function quadTest(t: number) {
  // textured quad with each corner wobbling on its own
  const wobble = Math.sin(t * 3) * 40;
  Draw.quad({
    points: [
      { x: 1500 + wobble, y: 700 },
      { x: 1820, y: 700 - wobble },
      { x: 1820 - wobble, y: 1000 },
      { x: 1500, y: 1000 + wobble },
    ],
    z: 0,
    texture: "land",
    crop: { x: 0, y: 0, width: 44, height: 44 },
  });

  // trapezoid with a material, uv follows the deformed shape
  const lean = Math.cos(t * 1.5) * 60;
  Draw.quad({
    points: [
      { x: 1500 + lean, y: 480 },
      { x: 1700 + lean, y: 480 },
      { x: 1820, y: 640 },
      { x: 1400, y: 640 },
    ],
    z: 0,
    color: COLOR.HOT_PINK,
    material: LASER_PULSE,
    params: PULSE_PARAMS,
  });
}

function lasersTest(t: number) {
  const center = { x: 960, y: 540, z: 0 };

  // rotating fan of electric lasers
  for (let i = 0; i < FAN_COLORS.length; i++) {
    const angle = t * 0.4 + (i / FAN_COLORS.length) * Math.PI * 2;
    const length = 620 + Math.sin(t * 1.3 + i) * 80;
    Draw.line({
      from: center,
      to: {
        x: center.x + Math.cos(angle) * length,
        y: center.y + Math.sin(angle) * length,
      },
      z: 0,
      width: 44,
      color: FAN_COLORS[i],
      cap: "round",
      material: LASER_ELECTRIC,
      params: FAN_PARAMS[i],
    });
  }
  Draw.circle({
    position: center,
    radius: 110,
    color: COLOR.CYAN,
    material: GLOW_ORB,
    params: ORB_CENTER,
  });

  // pulse beam across the top, between two emitters
  const pulseFrom = { x: 90, y: 110, z: 0 };
  const pulseTo = { x: 1830, y: 110, z: 0 };
  Draw.line({
    from: pulseFrom,
    to: pulseTo,
    z: 0,
    width: 34,
    color: COLOR.DARK_ORANGE,
    cap: "round",
    material: LASER_PULSE,
    params: PULSE_PARAMS,
  });
  for (const point of [pulseFrom, pulseTo]) {
    Draw.circle({
      position: point,
      radius: 45,
      color: COLOR.ORANGE,
      material: GLOW_ORB,
      params: ORB_SMALL,
    });
  }

  // thick plasma beam, swaying diagonal
  Draw.line({
    from: { x: 140, y: 900 + Math.sin(t * 0.7) * 60 },
    to: { x: 1780, y: 640 + Math.cos(t * 0.5) * 90 },
    z: 0,
    width: 90,
    color: COLOR.VIOLET,
    cap: "round",
    material: LASER_PLASMA,
    params: PLASMA_PARAMS,
  });

  // bullets fired from the bottom center in random directions
  const delta = Time.getDeltaTime();
  bulletTimer += delta;
  while (bulletTimer >= 1 / BULLET_RATE) {
    bulletTimer -= 1 / BULLET_RATE;
    const angle = AxiomMath.randomFloat(-Math.PI * 0.9, -Math.PI * 0.1);
    bullets.push({
      x: BULLET_ORIGIN.x,
      y: BULLET_ORIGIN.y,
      dirX: Math.cos(angle),
      dirY: Math.sin(angle),
      speed: AxiomMath.randomFloat(700, 1400),
      color: BULLET_COLORS[AxiomMath.randomInt(0, BULLET_COLORS.length - 1)],
    });
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.dirX * bullet.speed * delta;
    bullet.y += bullet.dirY * bullet.speed * delta;
    const gone =
      bullet.y < -BULLET_LENGTH ||
      bullet.x < -BULLET_LENGTH ||
      bullet.x > 1920 + BULLET_LENGTH;
    if (gone) {
      bullets[i] = bullets[bullets.length - 1];
      bullets.pop();
      continue;
    }
    Draw.line({
      from: {
        x: bullet.x - bullet.dirX * BULLET_LENGTH,
        y: bullet.y - bullet.dirY * BULLET_LENGTH,
      },
      to: bullet,
      z: 0,
      width: 22,
      color: bullet.color,
      material: LASER_TRACER,
      params: BULLET_PARAMS,
    });
  }
  Draw.circle({
    position: BULLET_ORIGIN,
    radius: 60,
    color: COLOR.GOLD,
    material: GLOW_ORB,
    params: ORB_SMALL,
  });
}

function pilarsTest(t: number) {
  // moving objects first, sorting must still place them correctly

  // opaque block going up and down through every pillar
  const blockBottom = 700 + Math.sin(t * 0.8) * 320;
  Draw.rect({
    position: { x: 170 + ((t * 180) % 1300), y: blockBottom - 120, z: 0 },
    size: { width: 140, height: 120 },
    color: [240, 240, 240, 255],
    outline: { width: 6, color: [20, 20, 20, 140] },
    rounded: 16,
  });

  // transparent ball crossing the pillars horizontally
  Draw.circle({
    position: { x: 200 + ((Math.sin(t * 0.5) + 1) / 2) * 1300, y: 640, z: 0 },
    radius: 70,
    color: [80, 220, 255, 130],
    outline: { width: 4, color: [255, 255, 255, 220] },
  });

  // hollow frame: only an outline, always transparent
  Draw.rect({
    position: {
      x: 900 + Math.cos(t) * 500,
      y: 520 + Math.sin(t * 1.3) * 250,
      z: 0,
    },
    size: { width: 180, height: 110 },
    color: COLOR.TRANSPARENT,
    outline: { width: 8, color: [255, 120, 40, 255] },
    rotation: t * 0.7,
  });

  // rotating stick, sort point follows its lowest end
  const stickPivot = { x: 1250, y: 760 };
  Draw.line({
    from: stickPivot,
    to: {
      x: stickPivot.x + Math.cos(t) * 300,
      y: stickPivot.y + Math.sin(t) * 300,
    },
    z: 0,
    width: 18,
    color: [255, 230, 90, 255],
    cap: "round",
  });

  // static pillars, call order flips every second
  const reversed = Math.floor(t) % 2 === 1;
  for (let i = 0; i < PILLARS.length; i++) {
    const pillar = PILLARS[reversed ? PILLARS.length - 1 - i : i];
    Draw.rect({
      position: { x: pillar.x, y: pillar.bottom - PILLAR_HEIGHT, z: 0 },
      size: { width: PILLAR_WIDTH, height: PILLAR_HEIGHT },
      color: pillar.color,
      outline: { width: 5, color: COLOR.BLACK },
    });
  }

  // ground line under each pillar, shows where its sort point is
  for (const pillar of PILLARS) {
    Draw.line({
      from: { x: pillar.x - 40, y: pillar.bottom },
      to: { x: pillar.x + PILLAR_WIDTH + 40, y: pillar.bottom },
      z: 0,
      width: 2,
      color: [255, 255, 255, 60],
    });
  }
}
function staticObjects() {
  Draw.beginFrame();
  const t = Time.getTimeInSeconds();
  Draw.rect({
    position: { x: 500, y: 300, z: 0 },
    size: { width: 180, height: 180 },
    color: [255, 60, 60, 255],
    outline: { color: [55, 60, 220, 255], width: 5 },
    rounded: [24, 0, 24, 0],
    // rotation: t,
  });
  Draw.rect({
    position: { x: 550, y: 350, z: 0 },
    size: { width: 80, height: 80 },
    color: [60, 120, 255, 140],
  });
  Draw.circle({
    position: { x: 400, y: 300, z: 0 },
    radius: 60,
    color: [60, 120, 255, 140],
    outline: { width: 3, color: COLOR.WHITE },
  });
  Draw.ellipse({
    position: { x: 900, y: 300, z: 0 },
    size: { width: 220, height: 90 },
    color: [60, 255, 140, 200],
    rotation: t * 0.5,
    outline: { width: 3, color: COLOR.WHITE },
  });
  Draw.line({
    from: { x: 300, y: 600 },
    to: { x: 300 + 200, y: 600 + 100 },
    z: 0,
    width: 10,
    color: [255, 200, 60, 255],
    cap: "round",
    outline: { width: 2, color: COLOR.WHITE },
  });
  Draw.sprite({
    position: { x: 1200, y: 200, z: 0 },
    texture: "land",
    size: { width: 476, height: 476 },
    // crop: { x: 0, y: 0, width: 44, height: 44 },
    rotation: Time.getTimeInSeconds() * 0.3,
    rounded: 20,
    outline: { width: 4, color: COLOR.WHITE },
  });
}
function sortBox([centerX, bottom, width, height, z, color]: SortBox) {
  Draw.rect({
    position: { x: centerX - width / 2, y: bottom - height, z },
    size: { width, height },
    color,
    outline: { width: 3, color: COLOR.BLACK },
  });
}

// draws a pair in both call orders, the result must not depend on it
function sortPair(swap: boolean, first: SortBox, second: SortBox) {
  if (swap) {
    sortBox(second);
    sortBox(first);
  } else {
    sortBox(first);
    sortBox(second);
  }
}

function sortTest(t: number) {
  const zSwap = Math.floor(t) % 2 === 1;
  const orderSwap = Math.floor(t / 3) % 2 === 1;

  // top row opaque, bottom row transparent, same rules must hold in both
  for (let row = 0; row < 2; row++) {
    const opaque = row === 0;
    const bottom = 380 + row * 460;
    const red = opaque ? COLOR.CRIMSON : SOFT_RED;
    const blue = opaque ? COLOR.DODGER_BLUE : SOFT_BLUE;
    const green = opaque ? COLOR.LIME : SOFT_GREEN;

    // 1. same sort point: only z decides, it swaps every second
    sortPair(
      orderSwap,
      [220, bottom, 220, 140, zSwap ? 1 : 0, red],
      [220, bottom, 110, 260, zSwap ? 0 : 1, blue],
    );

    // 2. same y: x decides, the left one has bigger z on purpose
    sortPair(
      orderSwap,
      [580, bottom, 160, 220, 9, red],
      [680, bottom, 160, 220, 0, blue],
    );

    // 3. y decides, the upper one has bigger x and z on purpose
    sortPair(
      orderSwap,
      [1000, bottom + 40, 160, 220, 0, green],
      [1080, bottom, 160, 260, 9, blue],
    );
  }

  // 4. opaque square and transparent circle on the same sort point,
  //    the circle z swaps: above the square or hidden behind it
  sortBox([1560, 380, 200, 200, 1, COLOR.GOLD]);
  Draw.circle({
    position: { x: 1560, y: 380 - 130, z: zSwap ? 2 : 0 },
    radius: 130,
    color: SOFT_CYAN,
  });
}

Engine.initialize({ setup, preload, update });
