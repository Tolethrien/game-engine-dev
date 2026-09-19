import Aurora from "@/core/aurora/core";
import { DrawGui } from "@/core/aurora/urp/draw";
import type { DrawShadow } from "@/core/aurora/urp/urpTypes";
import { COLOR } from "@/core/axiom/color";
import { GLOW_ORB, ORB_SMALL, TEXT_RAINBOW } from "./materials";

const LAYOUT = {
  width: 640,
  textHeight: 200,
  lightHeight: 300,
  darkHeight: 180,
  gap: 16,
  margin: 24,
};
const SHADOW_COLOR: RGBA = [0, 0, 0, 140];
const TEXT_COLOR: RGBA = [40, 44, 60, 255];

// bottom right corner: text shadows and box shadows on light panels, glows on a dark one
export function guiShadowTest(t: number) {
  const left = Aurora.canvas.width - LAYOUT.width - LAYOUT.margin;
  const darkTop = Aurora.canvas.height - LAYOUT.darkHeight - LAYOUT.margin;
  const lightTop = darkTop - LAYOUT.gap - LAYOUT.lightHeight;
  const textTop = lightTop - LAYOUT.gap - LAYOUT.textHeight;
  textShadows(left, textTop, t);
  shadows(left, lightTop, t);
  glows(left, darkTop, t);
}

function textShadows(left: number, top: number, t: number) {
  DrawGui.rect({
    position: { x: left, y: top, z: 0 },
    size: { width: LAYOUT.width, height: LAYOUT.textHeight },
    color: [225, 228, 235, 255],
    rounded: 16,
  });

  // one shadow on the three font kinds: grid, dynamic, mtsdf
  const soft: DrawShadow = {
    color: SHADOW_COLOR,
    offset: { x: 2, y: 3 },
    blur: 3,
  };
  DrawGui.text({
    position: { x: left + 30, y: top + 24, z: 0 },
    text: "Grid",
    size: 24,
    color: TEXT_COLOR,
    shadow: soft,
  });
  DrawGui.text({
    position: { x: left + 150, y: top + 20, z: 0 },
    font: "lato",
    text: "Dynamic",
    size: 32,
    color: TEXT_COLOR,
    shadow: soft,
  });
  DrawGui.text({
    position: { x: left + 330, y: top + 20, z: 0 },
    font: "latoSdf",
    text: "MTSDF",
    size: 32,
    color: TEXT_COLOR,
    shadow: soft,
  });

  // shadow under an outline, then several shadows
  DrawGui.text({
    position: { x: left + 30, y: top + 80, z: 0 },
    font: "blackOpsSdf",
    text: "Outline",
    size: 36,
    color: COLOR.WHITE,
    outline: { width: 2, color: TEXT_COLOR },
    shadow: { color: SHADOW_COLOR, offset: { x: 3, y: 4 }, blur: 2 },
  });
  DrawGui.text({
    position: { x: left + 260, y: top + 82, z: 0 },
    font: "latoSdf",
    text: "Layers",
    size: 36,
    color: COLOR.WHITE,
    shadow: [
      { color: [0, 0, 0, 160], offset: { x: 0, y: 2 }, blur: 1 },
      { color: [255, 60, 120, 200], spread: 1, blur: 4 },
    ],
  });

  // blur past the reach of the field: warns once and gets clamped
  DrawGui.text({
    position: { x: left + 450, y: top + 88, z: 0 },
    font: "lato",
    text: "Too soft",
    size: 22,
    color: TEXT_COLOR,
    shadow: { color: SHADOW_COLOR, offset: { x: 0, y: 4 }, blur: 30 },
  });

  // the same shadow on a box and on text, the blur should read alike
  const same: DrawShadow = {
    color: SHADOW_COLOR,
    offset: { x: 0, y: 4 },
    blur: 4,
  };
  DrawGui.rect({
    position: { x: left + 30, y: top + 145, z: 0 },
    size: { width: 90, height: 30 },
    color: COLOR.WHITE,
    rounded: 6,
    shadow: same,
  });
  DrawGui.text({
    position: { x: left + 140, y: top + 140, z: 0 },
    font: "latoSdf",
    text: "Same blur",
    size: 32,
    color: COLOR.WHITE,
    shadow: same,
  });

  // text glow on its own dark plate, away from the box glows; dynamic font: its field
  // reaches fontAtlas.spread px, the mtsdf one only a few px at this size and clamps the blur
  DrawGui.rect({
    position: { x: left + 390, y: top + 132, z: 0 },
    size: { width: 220, height: 52 },
    color: [14, 16, 24, 255],
    rounded: 12,
  });
  const pulse = (Math.sin(t * 3) + 1) / 2;
  DrawGui.text({
    position: { x: left + 425, y: top + 140, z: 0 },
    font: "latoBold",
    text: "Neon text",
    size: 30,
    color: [255, 220, 235, 255],
    shadow: { color: [255, 60, 120, 230], spread: 1, blur: 2 + pulse * 4 },
  });
}

function shadows(left: number, top: number, t: number) {
  DrawGui.rect({
    position: { x: left, y: top, z: 0 },
    size: { width: LAYOUT.width, height: LAYOUT.lightHeight },
    color: [225, 228, 235, 255],
    rounded: 16,
  });

  // plain outer shadow
  DrawGui.rect({
    position: { x: left + 30, y: top + 30, z: 0 },
    size: { width: 160, height: 100 },
    color: COLOR.WHITE,
    rounded: 12,
    shadow: { color: SHADOW_COLOR, offset: { x: 0, y: 8 }, blur: 24 },
  });

  // inner shadow lies under the outline, not on it
  DrawGui.rect({
    position: { x: left + 230, y: top + 30, z: 0 },
    size: { width: 160, height: 100 },
    color: [245, 245, 250, 255],
    rounded: 12,
    outline: { width: 4, color: COLOR.SKY_BLUE },
    shadow: {
      color: SHADOW_COLOR,
      offset: { x: 4, y: 4 },
      blur: 12,
      inset: true,
    },
  });

  // see-through panel: its own shadow is cut out under it
  DrawGui.rect({
    position: { x: left + 430, y: top + 30, z: 0 },
    size: { width: 180, height: 100 },
    color: [80, 140, 255, 90],
    rounded: 12,
    outline: { width: 2, color: [80, 140, 255, 200] },
    shadow: { color: SHADOW_COLOR, offset: { x: 10, y: 10 }, blur: 16 },
  });

  // small button, blur larger than itself
  DrawGui.rect({
    position: { x: left + 40, y: top + 200, z: 0 },
    size: { width: 60, height: 28 },
    color: COLOR.WHITE,
    rounded: 8,
    shadow: { color: SHADOW_COLOR, offset: { x: 0, y: 6 }, blur: 60 },
  });

  // negative spread: a narrow shadow under a wide card
  DrawGui.rect({
    position: { x: left + 140, y: top + 180, z: 0 },
    size: { width: 140, height: 70 },
    color: COLOR.WHITE,
    rounded: 10,
    shadow: {
      color: SHADOW_COLOR,
      offset: { x: 0, y: 18 },
      blur: 14,
      spread: -12,
    },
  });

  // several shadows, the first one on top, and a light inner edge at the top
  const lift = (Math.sin(t * 2) + 1) / 2;
  DrawGui.rect({
    position: { x: left + 320, y: top + 180, z: 0 },
    size: { width: 130, height: 70 },
    color: [70, 90, 140, 255],
    rounded: [20, 4, 20, 4],
    shadow: [
      { color: [0, 0, 0, 90], offset: { x: 0, y: 2 + lift * 4 }, blur: 4 },
      { color: [0, 0, 0, 60], offset: { x: 0, y: 10 + lift * 14 }, blur: 30 },
      {
        color: [255, 255, 255, 170],
        offset: { x: 0, y: 3 },
        blur: 4,
        inset: true,
      },
    ],
  });

  // normal blend material keeps shadow and box in one draw
  DrawGui.rect({
    position: { x: left + 490, y: top + 190, z: 0 },
    size: { width: 110, height: 44 },
    color: COLOR.WHITE,
    rounded: 22,
    material: TEXT_RAINBOW,
    shadow: { color: SHADOW_COLOR, offset: { x: 0, y: 6 }, blur: 12 },
  });
}

// a glow is a colored shadow without offset: spread for the body, blur for the fade
function glows(left: number, top: number, t: number) {
  DrawGui.rect({
    position: { x: left, y: top, z: 0 },
    size: { width: LAYOUT.width, height: LAYOUT.darkHeight },
    color: [14, 16, 24, 255],
    rounded: 16,
  });

  const pulse = (Math.sin(t * 3) + 1) / 2;
  DrawGui.rect({
    position: { x: left + 40, y: top + 55, z: 0 },
    size: { width: 110, height: 70 },
    color: [30, 32, 44, 255],
    rounded: [20, 4, 20, 4],
    outline: { width: 2, color: [255, 60, 120, 255] },
    shadow: {
      color: [255, 60, 120, 150],
      spread: 2 + pulse * 6,
      blur: 24,
    },
  });

  // outer glow plus an inner one
  DrawGui.rect({
    position: { x: left + 210, y: top + 60, z: 0 },
    size: { width: 140, height: 60 },
    color: [20, 40, 60, 255],
    rounded: 30,
    shadow: [
      { color: [60, 200, 255, 160], blur: 30 },
      { color: [60, 200, 255, 120], blur: 16, inset: true },
    ],
  });

  // soft light blob, blur much larger than the element
  DrawGui.rect({
    position: { x: left + 410, y: top + 76, z: 0 },
    size: { width: 60, height: 28 },
    color: COLOR.WHITE,
    rounded: 8,
    shadow: { color: [255, 255, 255, 120], blur: 60 },
  });

  // additive material: the orb adds light, its shadow falls back to the default material
  DrawGui.circle({
    position: { x: left + 560, y: top + 90, z: 0 },
    radius: 22,
    color: COLOR.GOLD,
    material: GLOW_ORB,
    params: ORB_SMALL,
    shadow: { color: [255, 180, 60, 90], blur: 20, spread: 4 },
  });
}
