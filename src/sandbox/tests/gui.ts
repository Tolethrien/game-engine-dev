import { DrawGui } from "@/core/aurora2/urp/draw";
import { COLOR } from "@/core/axiom/color";
import { GLOW_ORB, ORB_SMALL } from "./materials";

export function guiTest(t: number) {
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
