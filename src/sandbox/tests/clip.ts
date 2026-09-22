import { Draw } from "@/core/aurora/urp/draw/draw";
import type { GuiRect } from "@/core/aurora/urp/draw/drawTypes";
import TextBox from "@/core/aurora/text/textBox";
import { COLOR } from "@/core/axiom/color";

const PANEL = {
  x: 60,
  y: 80,
  width: 420,
  height: 520,
  radius: 24,
  border: 4,
  rowHeight: 64,
  rows: 40,
};
const COLORS = {
  panel: [22, 24, 34, 240] as RGBA,
  border: [120, 130, 190, 255] as RGBA,
  row: [52, 58, 86, 255] as RGBA,
  rowAlt: [70, 78, 116, 255] as RGBA,
  text: [230, 232, 245, 255] as RGBA,
  shadow: [0, 0, 0, 160] as RGBA,
};
const NOTE_BOX = new TextBox({
  font: "lato",
  size: 18,
  width: 300,
  lineGap: 4,
  text:
    "Clip test: a scrolling list inside a rounded panel, cut to the inside of its border. " +
    "Some rows clip a spinning card to their own rounded box, this rotated panel clips " +
    "rotating content. Everything fully outside a clip is culled on the cpu.",
});

// left: rounded scroll panel clipped to its padding box, nested clip inside
// right: rotated panel with rotating content; world: rotated rounded window with rotating bars
export function clipTest(t: number) {
  // scrollPanel(t);
  // rotatedPanel(t);
  worldWindow(t);
}

// function scrollPanel(t: number) {
//   const panel: GuiRect = {
//     position: { x: PANEL.x, y: PANEL.y, z: 0 },
//     size: { width: PANEL.width, height: PANEL.height },
//     color: COLORS.panel,
//     outline: { width: PANEL.border, color: COLORS.border },
//     rounded: PANEL.radius,
//   };
//   DrawGui.rect({
//     ...panel,
//     shadow: { color: COLORS.shadow, offset: { x: 0, y: 8 }, blur: 24 },
//   });
//   DrawGui.pushClip({ ...panel, inset: PANEL.border });

//   const scroll =
//     ((Math.sin(t * 0.4) + 1) / 2) *
//     (PANEL.rows * PANEL.rowHeight - PANEL.height);
//   for (let i = 0; i < PANEL.rows; i++) {
//     const y = PANEL.y + i * PANEL.rowHeight - scroll;
//     DrawGui.rect({
//       position: { x: PANEL.x + 12, y: y + 6, z: 0 },
//       size: { width: PANEL.width - 24, height: PANEL.rowHeight - 12 },
//       color: i % 2 ? COLORS.row : COLORS.rowAlt,
//       rounded: 10,
//       shadow: { color: COLORS.shadow, offset: { x: 0, y: 3 }, blur: 6 },
//     });
//     DrawGui.text({
//       position: { x: PANEL.x + 32, y: y + 20, z: 0 },
//       font: "lato",
//       text: `Item ${i + 1}`,
//       size: 20,
//       color: COLORS.text,
//     });

//     // every fifth row clips a spinning card to its own rounded box
//     if (i % 5 !== 2) continue;
//     const box = {
//       position: { x: PANEL.x + 200, y: y + 10 },
//       size: { width: 180, height: PANEL.rowHeight - 20 },
//       rounded: 8,
//     };
//     DrawGui.pushClip(box);
//     DrawGui.rect({
//       position: { x: PANEL.x + 230, y: y - 20, z: 0 },
//       size: { width: 120, height: 100 },
//       rotation: t * 1.5,
//       color: COLOR.GOLD,
//       outline: { width: 3, color: COLOR.BLACK },
//       rounded: 12,
//     });
//     DrawGui.popClip();
//   }
//   DrawGui.popClip();
// }

// function rotatedPanel(t: number) {
//   const rotation = Math.sin(t * 0.6) * 0.5;
//   const panel: GuiRect = {
//     position: { x: 560, y: 120, z: 0 },
//     size: { width: 360, height: 280 },
//     rotation,
//     color: COLORS.panel,
//     outline: { width: 3, color: COLORS.border },
//     rounded: [40, 8, 40, 8],
//   };
//   DrawGui.rect(panel);
//   DrawGui.pushClip({ ...panel, inset: 3 });
//   for (let i = 0; i < 6; i++) {
//     const angle = t + (i / 6) * Math.PI * 2;
//     DrawGui.circle({
//       position: {
//         x: 740 + Math.cos(angle) * 190,
//         y: 260 + Math.sin(angle) * 120,
//         z: 0,
//       },
//       radius: 56,
//       color: [80 + i * 30, 200 - i * 20, 255, 200],
//       outline: { width: 3, color: COLOR.WHITE },
//     });
//   }
//   DrawGui.sprite({
//     position: { x: 640, y: 200, z: 0 },
//     texture: "landUI",
//     size: { width: 220, height: 140 },
//     rotation: -t,
//   });
//   DrawGui.textBox(NOTE_BOX, {
//     position: { x: 600, y: 140 - ((t * 30) % 200), z: 0 },
//     color: COLORS.text,
//     outline: { width: 2, color: COLOR.BLACK },
//   });
//   DrawGui.popClip();
// }

function worldWindow(t: number) {
  const opening = {
    position: { x: 1100, y: 500 },
    size: { width: 500, height: 360 },
    rotation: t * 0.2,
    rounded: 60,
    inset: 2,
  };
  Draw.rect({
    position: { ...opening.position, z: 0 },
    size: opening.size,
    rotation: opening.rotation,
    rounded: opening.rounded,
    color: [0, 0, 0, 0],
    outline: { width: 2, color: COLOR.WHITE },
  });
  Draw.pushClip(opening);
  for (let i = 0; i < 8; i++) {
    Draw.rect({
      position: { x: 1000 + i * 90, y: 450 + Math.sin(t + i) * 120, z: 0 },
      size: { width: 70, height: 300 },
      rotation: t * 0.5 + i,
      color: [60 + i * 24, 120, 220 - i * 20, 255],
    });
  }
  Draw.popClip();
}
