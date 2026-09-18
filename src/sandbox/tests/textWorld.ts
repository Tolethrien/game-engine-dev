import { Draw } from "@/core/aurora2/urp/draw";
import { COLOR } from "@/core/axiom/color";
import TextBox from "@/core/aurora2/text/textBox";
import TextLayout from "@/core/aurora2/text/textLayout";
import { TEXT_GLOW, TEXT_RAINBOW } from "./materials";

// the game only ever draws mtsdf text in world space (latoSdf, blackOpsSdf):
// it is the only font type that stays sharp at any zoom. bitmap and dynamic
// ttf fonts are ui-only, see textGui.ts.

const CENTER_X = 960;

const QUOTE_BOX = new TextBox({
  font: "latoSdf",
  size: 22,
  width: 900,
  align: "center",
  lineGap: 4,
  text:
    "The old lighthouse keeper asks you to bring back the lantern oil " +
    "stolen by smugglers hiding in the caves north of the harbour.",
});

function title(t: number) {
  // the whole usable mtsdf range in one line: unreadable to huge, the
  // outline grows with it and the edge stays sharp the whole way
  const size = 26 + ((Math.sin(t * 0.4) + 1) / 2) * 150;
  const text = "QUEST COMPLETE";
  const width = TextLayout.measure("blackOpsSdf", text, size).width;
  Draw.text({
    position: { x: CENTER_X - width / 2, y: 90, z: 0 },
    font: "blackOpsSdf",
    text,
    size,
    color: COLOR.GOLD,
    outline: { width: Math.max(1, size * 0.045), color: COLOR.BLACK },
  });
}

function quote(t: number) {
  // width flips every 2 s, the lines must wrap differently
  // QUOTE_BOX.set({ width: Math.floor(t / 2) % 2 === 0 ? 700 : 900 });
  Draw.textBox(QUOTE_BOX, {
    position: { x: CENTER_X - 450, y: 300, z: 0 },
    color: [220, 224, 235, 255],
  });
}

function materials() {
  const text = "RAINBOW";
  const size = 46;
  const width = TextLayout.measure("blackOpsSdf", text, size).width;
  Draw.text({
    position: { x: CENTER_X - width / 2, y: 470, z: 0 },
    font: "blackOpsSdf",
    text,
    size,
    material: TEXT_RAINBOW,
    params: [0.4, 1, 0, 0],
  });
  Draw.text({
    position: { x: CENTER_X - width / 2, y: 530, z: 0 },
    font: "blackOpsSdf",
    text,
    size,
    material: TEXT_RAINBOW,
    params: [0.4, 1, 0, 0],
    uvScope: "text",
  });

  const glowText = "NEON";
  const glowSize = 54;
  const glowWidth = TextLayout.measure("latoSdf", glowText, glowSize).width;
  Draw.text({
    position: { x: CENTER_X - glowWidth / 2, y: 610, z: 0 },
    font: "latoSdf",
    text: glowText,
    size: glowSize,
    color: COLOR.HOT_PINK,
    material: TEXT_GLOW,
    params: [7, 0.5, 0.6, 0],
  });
}

function outline(t: number) {
  const text = "DANGER";
  const size = 60;
  const width = TextLayout.measure("blackOpsSdf", text, size).width;
  const outlineWidth = 1 + ((Math.sin(t * 2) + 1) / 2) * 3;
  Draw.text({
    position: { x: CENTER_X - width / 2, y: 700, z: 0 },
    font: "blackOpsSdf",
    text,
    size,
    color: COLOR.ORANGE,
    outline: { width: outlineWidth, color: COLOR.WHITE },
  });
}

// boxes flying across the fixed text rows above, some opaque, some
// transparent: the sort config alone must decide who covers who as they
// cross, the same as any moving world object would in the real game
interface Flyer {
  y: number;
  speed: number;
  offset: number;
  size: number;
  wobble: number;
  color: RGBA;
  shape: "rect" | "circle";
}
const FIELD = { left: 140, right: 1780 };
const FLYERS: Flyer[] = [
  {
    y: 90,
    speed: 130,
    offset: 0,
    size: 70,
    wobble: 25,
    color: COLOR.CRIMSON,
    shape: "rect",
  },
  {
    y: 340,
    speed: -95,
    offset: 260,
    size: 60,
    wobble: 40,
    color: [90, 200, 255, 180],
    shape: "circle",
  },
  {
    y: 500,
    speed: 115,
    offset: 620,
    size: 80,
    wobble: 20,
    color: COLOR.LIME,
    shape: "rect",
  },
  {
    y: 610,
    speed: -140,
    offset: 980,
    size: 55,
    wobble: 35,
    color: [255, 210, 90, 170],
    shape: "circle",
  },
  {
    y: 700,
    speed: 80,
    offset: 1300,
    size: 90,
    wobble: 15,
    color: [200, 90, 255, 200],
    shape: "rect",
  },
];

function flyingBoxes(t: number) {
  const span = FIELD.right - FIELD.left;
  for (const flyer of FLYERS) {
    const x =
      FIELD.left + ((((flyer.offset + t * flyer.speed) % span) + span) % span);
    const y = flyer.y + Math.sin(t * 1.2 + flyer.offset * 0.01) * flyer.wobble;
    if (flyer.shape === "rect") {
      Draw.rect({
        position: { x: x - flyer.size / 2, y: y - flyer.size / 2, z: 0 },
        size: { width: flyer.size, height: flyer.size },
        color: flyer.color,
        outline: { width: 3, color: COLOR.BLACK },
      });
    } else {
      Draw.circle({
        position: { x, y, z: 0 },
        radius: flyer.size / 2,
        color: flyer.color,
        outline: { width: 3, color: COLOR.BLACK },
      });
    }
  }
}

export function textWorldTest(t: number) {
  title(t);
  quote(t);
  materials();
  outline(t);
  flyingBoxes(t);
}
