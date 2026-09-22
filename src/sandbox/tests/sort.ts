import { Draw } from "@/core/aurora/urp/draw/draw";
import { COLOR } from "@/core/axiom/color";

// soft copies for the transparent row of the sort test
const SOFT_RED: RGBA = [220, 20, 60, 200];
const SOFT_BLUE: RGBA = [30, 144, 255, 200];
const SOFT_GREEN: RGBA = [50, 205, 50, 200];
const SOFT_CYAN: RGBA = [0, 255, 255, 170];

// center x, bottom, width, height, z, color
type SortBox = [number, number, number, number, number, RGBA];

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

export function sortTest(t: number) {
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
