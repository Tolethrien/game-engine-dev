import Navi from "../navi";
import UINode, { NodeProps } from "../node";
import { auto, px } from "../units";
import UIText from "./text";
import { Tweens } from "../tween";
export const MENU_ITEMS = ["Weź", "Wyrzuć", "Informacje"];

export default class SlotNode extends UINode {
  public menu: UINode | undefined;

  constructor(
    public readonly index: number,
    props: NodeProps = {},
  ) {
    super(props);
  }

  public openMenu() {
    if (this.menu) return;

    const menu = Navi.append(
      new UINode({
        portal: true,
        position: { x: px(24), y: px(24) },
        size: { width: auto(), height: auto() },
        style: {
          backgroundColor: [24, 24, 34, 245],
          rounded: 0.15,
          layout: "stack",
          direction: "col",
          gap: 2,
          padding: { top: 4, right: 4, bottom: 4, left: 4 },
          alignCross: "stretch",
          origin: { x: 0, y: 0 },
        },
      }),
      this,
    );
    this.menu = menu;

    for (const label of MENU_ITEMS) {
      const item = Navi.append(
        new UINode({
          size: { width: auto(), height: auto() },
          input: "absorb",
          style: {
            backgroundColor: [70, 95, 150, 0],
            rounded: 0.1,
            transitionMs: 90,
            layout: "stack",
            alignMain: "center",
            alignCross: "start",
            padding: { top: 6, right: 16, bottom: 6, left: 10 },
          },
          states: { hovered: { backgroundColor: [70, 95, 150, 255] } },
        }),
        menu,
      );

      Navi.append(
        new UIText(() => label, {
          size: { width: auto(), height: auto() },
          inheritState: true,
          style: { textColor: [205, 205, 225, 255], textSize: 13 },
          states: { hovered: { textColor: [255, 255, 255, 255] } },
        }),
        item,
      );
    }
    menu.play(Tweens.popIn(200));
  }

  public closeMenu() {
    if (!this.menu) return;
    const menu = this.menu;
    this.menu = undefined; // od razu — drugi klik nie ma w co trafić
    menu.input = "disabled";
    menu.play(Tweens.popOut(110, undefined, () => Navi.remove(menu, this)));
  }
}
