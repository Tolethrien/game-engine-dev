import Aurora from "@/core/aurora/core";
import { DrawGui } from "@/core/aurora/urp/draw/draw";
import { COLOR } from "@/core/axiom/color";
import TextBox from "@/core/aurora/text/textBox";
import TextLayout from "@/core/aurora/text/textLayout";

// the game ui only ever draws bitmap (built-in default font) or dynamic ttf
// text: the hud is fixed on screen, so it never needs mtsdf's scale-free edge.

const PANEL_BACKGROUND: RGBA = [16, 17, 24, 235];
const PANEL_BORDER: RGBA = [62, 66, 90, 255];
const MUTED: RGBA = [140, 146, 170, 255];
const GUIDE: RGBA = [255, 90, 90, 150];

const MARGIN = 20;
const TOP_BAR_HEIGHT = 64;
const BOTTOM_BAR_HEIGHT = 150;
const PANEL_WIDTH = 360;
const PANEL_HEIGHT = 230;

function panelFrame(x: number, y: number, width: number, height: number) {
  DrawGui.rect({
    position: { x, y },
    size: { width, height },
    color: PANEL_BACKGROUND,
    outline: { width: 2, color: PANEL_BORDER },
    rounded: 12,
  });
}

//=============================== top bar: title + a bitmap sample

function topBar() {
  const width = Aurora.canvas.width;
  panelFrame(0, 0, width, TOP_BAR_HEIGHT);
  DrawGui.text({
    position: { x: MARGIN, y: 14 },
    font: "blackOps",
    text: "GAME HUD",
    size: 26,
    color: COLOR.GOLD,
    outline: { width: 2, color: COLOR.BLACK },
  });
  DrawGui.text({
    position: { x: 220, y: 20 },
    font: "lato",
    text: "top bar, dynamic ttf",
    size: 15,
    color: MUTED,
  });
  // bitmap font: no rasterization, exact 1:1 pixels; omitted font uses the default
  DrawGui.text({
    position: { x: width - 220, y: 16 },
    text: "PIXEL",
    size: 22,
    color: COLOR.HOT_PINK,
    outline: { width: 2, color: COLOR.MAGENTA },
  });
}

//=============================== bottom bar: scrolling event log

const LOG_BOX = new TextBox({
  font: "lato",
  size: 15,
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

function bottomBar(t: number) {
  const width = Aurora.canvas.width;
  const height = Aurora.canvas.height;
  const y = height - BOTTOM_BAR_HEIGHT;
  panelFrame(0, y, width, BOTTOM_BAR_HEIGHT);

  const count = Math.floor(t * 1.5);
  let log = "";
  for (let i = Math.max(0, count - 10); i <= count; i++) {
    log += `${log ? "\n" : ""}${LOG_EVENTS[i % LOG_EVENTS.length]}`;
  }
  LOG_BOX.set({
    text: log,
    width: width - MARGIN * 2,
    height: BOTTOM_BAR_HEIGHT - MARGIN * 2,
  });
  DrawGui.textBox(LOG_BOX, { position: { x: MARGIN, y: y + MARGIN } });
}

//=============================== top-left panel: justify + wrap

const QUEST_TEXT =
  "The old lighthouse keeper asks you to bring back the lantern oil " +
  "stolen by smugglers hiding in the caves north of the harbour.";
const JUSTIFY_BOX = new TextBox({
  font: "lato",
  size: 15,
  width: PANEL_WIDTH - 40,
  align: "justify",
  lineGap: 3,
  text: QUEST_TEXT,
});

function topLeftPanel(x: number, y: number) {
  panelFrame(x, y, PANEL_WIDTH, PANEL_HEIGHT);
  DrawGui.text({
    position: { x: x + 20, y: y + 16 },
    font: "latoBold",
    text: "QUEST LOG",
    size: 20,
  });
  DrawGui.textBox(JUSTIFY_BOX, {
    position: { x: x + 20, y: y + 54 },
    color: [210, 214, 228, 255],
  });
}

//=============================== top-right panel: align end + letter spacing

const ALIGN_BOXES = (["start", "center", "end"] as const).map(
  (align) =>
    new TextBox({
      font: "lato",
      size: 16,
      width: PANEL_WIDTH - 40,
      align,
      text: `align ${align}`,
    }),
);

function topRightPanel(x: number, y: number, t: number) {
  panelFrame(x, y, PANEL_WIDTH, PANEL_HEIGHT);
  DrawGui.text({
    position: { x: x + 20, y: y + 16 },
    font: "latoBold",
    text: "ALIGNMENT",
    size: 20,
  });
  ALIGN_BOXES.forEach((box, i) => {
    DrawGui.textBox(box, { position: { x: x + 20, y: y + 56 + i * 28 } });
  });

  DrawGui.text({
    position: { x: x + 20, y: y + 160 },
    font: "latoBold",
    text: "CHAPTER ONE",
    size: 16,
    letterSpacing: 6 + Math.round(Math.sin(t * 1.5) * 3),
    color: MUTED,
  });
}

//=============================== bottom-left panel: ellipsis + fit

const ITEM_BOX = new TextBox({
  font: "latoBold",
  size: 17,
  width: PANEL_WIDTH - 40,
  overflow: "ellipsis",
  wrap: false,
  text: "Ancient Lantern of the Drowned Lighthouse Keeper",
});
const TAVERN_NAMES = [
  "Inn",
  "The Rusty Anchor",
  "The Rusty Anchor Tavern and Stables of the North Road",
];
const SIGN_BOX = new TextBox({
  font: "medieval",
  size: 30,
  width: PANEL_WIDTH - 40,
  height: 50,
  align: "center",
  alignCross: "center",
  overflow: "fit",
});

function bottomLeftPanel(x: number, y: number, t: number) {
  panelFrame(x, y, PANEL_WIDTH, PANEL_HEIGHT);
  DrawGui.text({
    position: { x: x + 20, y: y + 16 },
    font: "latoBold",
    text: "OVERFLOW",
    size: 20,
  });
  DrawGui.text({
    position: { x: x + 20, y: y + 54 },
    font: "lato",
    text: "ellipsis, one line",
    size: 13,
    color: MUTED,
  });
  DrawGui.textBox(ITEM_BOX, {
    position: { x: x + 20, y: y + 74 },
    color: COLOR.GOLD,
  });

  const name = TAVERN_NAMES[Math.floor(t / 2) % TAVERN_NAMES.length];
  SIGN_BOX.set({ text: name });
  DrawGui.rect({
    position: { x: x + 20, y: y + 120 },
    size: { width: PANEL_WIDTH - 40, height: 50 },
    color: COLOR.TRANSPARENT,
    outline: { width: 1, color: GUIDE },
  });
  DrawGui.textBox(SIGN_BOX, {
    position: { x: x + 20, y: y + 120 },
    color: COLOR.PEACH,
  });
}

//=============================== bottom-right panel: column direction + button

const COLUMN_BOX = new TextBox({
  font: "latoBold",
  size: 18,
  direction: "col",
  height: 150,
  lineGap: 8,
  text: "SCORE",
});
const BUTTON_BOX = new TextBox({
  font: "blackOps",
  size: 20,
  width: 180,
  height: 44,
  align: "center",
  alignCross: "center",
  text: "START",
});

function bottomRightPanel(x: number, y: number, t: number) {
  panelFrame(x, y, PANEL_WIDTH, PANEL_HEIGHT);
  DrawGui.text({
    position: { x: x + 20, y: y + 16 },
    font: "latoBold",
    text: "COLUMN + BUTTON",
    size: 18,
  });
  DrawGui.textBox(COLUMN_BOX, {
    position: { x: x + 20, y: y + 54 },
    color: COLOR.SKY_BLUE,
  });

  // button: draw scale pulses around its center, the layout never changes
  const pulse = 1 + Math.sin(t * 4) * 0.06;
  const button = BUTTON_BOX.getSize;
  const centerX = x + 220;
  const centerY = y + 170;
  const scaled = { width: button.width * pulse, height: button.height * pulse };
  const buttonPosition = {
    x: centerX - scaled.width / 2,
    y: centerY - scaled.height / 2,
  };
  DrawGui.rect({
    position: buttonPosition,
    size: scaled,
    color: [40, 120, 70, 255],
    outline: { width: 2, color: COLOR.LIME },
    rounded: 10,
  });
  DrawGui.textBox(BUTTON_BOX, { position: buttonPosition, scale: pulse });
}

export function textGuiTest(t: number) {
  const width = Aurora.canvas.width;
  const height = Aurora.canvas.height;
  topBar();
  bottomBar(t);
  topLeftPanel(MARGIN, TOP_BAR_HEIGHT + MARGIN);
  topRightPanel(width - MARGIN - PANEL_WIDTH, TOP_BAR_HEIGHT + MARGIN, t);
  bottomLeftPanel(
    MARGIN,
    height - BOTTOM_BAR_HEIGHT - MARGIN - PANEL_HEIGHT,
    t,
  );
  bottomRightPanel(
    width - MARGIN - PANEL_WIDTH,
    height - BOTTOM_BAR_HEIGHT - MARGIN - PANEL_HEIGHT,
    t,
  );
}
