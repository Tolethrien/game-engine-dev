import Aurora from "@/core/aurora2/core";
import { DrawGui } from "@/core/aurora2/urp/draw";
import { COLOR } from "@/core/axiom/color";

const LAYOUT = {
  width: 560,
  height: 300,
  top: 24,
  stripe: 28,
  buttonWidth: 150,
  buttonHeight: 36,
  buttonGap: 10,
};
const STRIPES: RGBA[] = [
  [230, 70, 70, 255],
  [250, 200, 60, 255],
  [70, 190, 110, 255],
  [70, 130, 230, 255],
];
const GLASS_TINT: RGBA = [255, 255, 255, 40];
const GLASS_EDGE: RGBA = [255, 255, 255, 120];

// top center: glass over gui stripes (gui behind must blur too), a list of glass buttons
// sharing one snapshot, nested glass and a rotated one sliding over the world
export function guiBackdropTest(t: number) {
  const left = (Aurora.canvas.width - LAYOUT.width) / 2;
  const top = LAYOUT.top;
  stripes(left, top);

  // moving panel over the stripes and past their right edge into the world
  const slide = (Math.sin(t * 0.6) * 0.5 + 0.5) * (LAYOUT.width - 120);
  DrawGui.rect({
    position: { x: left + slide - 60, y: top + 20, z: 0 },
    size: { width: 240, height: 120 },
    rounded: 18,
    color: GLASS_TINT,
    outline: { width: 1, color: GLASS_EDGE },
    shadow: { color: [0, 0, 0, 90], offset: { x: 0, y: 6 }, blur: 16 },
    backdrop: { blur: 3 + (Math.sin(t) * 0.5 + 0.5) * 18 },
  });
  // nested: blurs the panel above together with the stripes
  DrawGui.rect({
    position: { x: left + slide + 20, y: top + 60, z: 0 },
    size: { width: 110, height: 60 },
    rounded: 12,
    color: [120, 180, 255, 50],
    outline: { width: 1, color: GLASS_EDGE },
    backdrop: { blur: 3 },
  });

  // a vertical list: text of one button never lies under the next, so one group
  const listLeft = left + 16;
  for (let i = 0; i < 4; i++) {
    const y = top + 160 + i * (LAYOUT.buttonHeight + LAYOUT.buttonGap) * 0.8;
    DrawGui.rect({
      position: { x: listLeft + i * 60, y, z: 0 },
      size: { width: LAYOUT.buttonWidth, height: LAYOUT.buttonHeight * 0.7 },
      rounded: 8,
      color: GLASS_TINT,
      backdrop: { blur: 3 },
    });
    DrawGui.text({
      position: { x: listLeft + i * 60 + 12, y: y + 3, z: 0 },
      font: "lato",
      text: `Button ${i + 1}`,
      size: 16,
      color: COLOR.WHITE,
    });
  }

  // rotated glass on the world, right of the stripes
  DrawGui.rect({
    position: { x: left + LAYOUT.width + 40, y: top + 60, z: 0 },
    size: { width: 160, height: 160 },
    rotation: t * 0.4,
    rounded: 24,
    color: [255, 220, 180, 30],
    backdrop: { blur: 3 },
  });
}

function stripes(left: number, top: number) {
  const count = Math.ceil(LAYOUT.width / LAYOUT.stripe);
  for (let i = 0; i < count; i++) {
    DrawGui.rect({
      position: { x: left + i * LAYOUT.stripe, y: top, z: 0 },
      size: { width: LAYOUT.stripe / 2, height: LAYOUT.height },
      color: STRIPES[i % STRIPES.length],
    });
  }
  DrawGui.text({
    position: { x: left + 20, y: top + LAYOUT.height - 40, z: 0 },
    font: "latoBold",
    text: "Backdrop blur",
    size: 28,
    color: COLOR.WHITE,
  });
}
