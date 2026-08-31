import FontGen from "@/core/aurora/renderer/fontGen";
import AxiomMath from "@/core/axiom/math";
import Navi from "../navi";
import UINode, { KeyInput, NodeProps } from "../node";
import { Style } from "../style";
import { Tween, Tweens } from "../tween";
import { auto } from "../units";
import UIText from "./text";

const AURORA_PIXEL_OFFSET = 8;

export interface InputProps extends NodeProps {
  value?: string;
  placeholder?: string;
  placeholderColor?: RGBA;
  caretColor?: RGBA;
  maxLength?: number;
  caretWidth?: number;
  onSubmit?: (value: string) => void;
  blurOnSubmit?: boolean;
}

export default class UIInput extends UINode {
  public value: string;
  public onSubmit: ((value: string) => void) | undefined;
  private placeholder: string;
  private placeholderColor: RGBA;
  private maxLength: number;
  private caretWidth: number;
  private blurOnSubmit: boolean;
  private caret: number;
  private view = 0; // o ile tekst jest przesunięty w lewo
  private label: UIText;
  private bar: UINode;
  private blink: Tween | undefined;

  constructor(props: InputProps = {}) {
    super({ ...props, focusable: true, wantsKeys: true });
    this.value = props.value ?? "";
    this.placeholder = props.placeholder ?? "";
    this.placeholderColor = props.placeholderColor ?? [110, 110, 130, 255];
    this.maxLength = props.maxLength ?? 256;
    this.caretWidth = props.caretWidth ?? 2;
    this.blurOnSubmit = props.blurOnSubmit ?? true;
    this.onSubmit = props.onSubmit;
    this.caret = this.value.length;

    // części pola, więc omijają kolejkę — tak jak gałka w UIScrollBar
    this.label = new UIText(
      () => (this.value.length > 0 ? this.value : this.placeholder),
      { size: { width: auto(), height: auto() } },
    );
    this.bar = new UINode({
      style: { backgroundColor: props.caretColor ?? [235, 235, 250, 255] },
    });
    this.bar.motion.alpha = 0;

    for (const child of [this.label as UINode, this.bar]) {
      child.parent = this;
      this.children.push(child);
    }
  }

  protected styleDefaults(): DeepPartial<Style> {
    return { overflowX: "clip", overflowY: "clip" };
  }

  private widthOf(text: string, scale: number) {
    return FontGen.measureText({
      fontName: this.style.textFont,
      fontSize: this.style.textSize * scale + AURORA_PIXEL_OFFSET,
      text,
    }).width;
  }

  /** raz na klatkę, przed pomiarem */
  public contentChanged() {
    this.label.style.textFont = this.style.textFont;
    this.label.style.textSize = this.style.textSize;
    this.label.style.textColor =
      this.value.length > 0 ? this.style.textColor : this.placeholderColor;

    if (this.focused && !this.blink) {
      this.blink = this.bar.play(Tweens.caretBlink());
    } else if (!this.focused && this.blink) {
      this.bar.stopTween(this.blink);
      this.bar.motion.alpha = 0;
      this.blink = undefined;
    }
    return false; // zmianę tekstu zgłosi sama etykieta
  }

  public layoutChildren(scale: number) {
    const p = this.style.padding;
    const innerX = this.pixelBox.x + p.left * scale;
    const innerY = this.pixelBox.y + p.top * scale;
    const innerW = this.pixelBox.w - (p.left + p.right) * scale;
    const innerH = this.pixelBox.h - (p.top + p.bottom) * scale;

    const caretX = this.widthOf(this.value.slice(0, this.caret), scale);

    // widok goni kursor, żeby ten nigdy nie wyszedł poza pole
    if (caretX - this.view > innerW) this.view = caretX - innerW;
    if (caretX - this.view < 0) this.view = caretX;
    this.view = AxiomMath.clamp(
      this.view,
      0,
      Math.max(0, this.label.measured.width - innerW),
    );

    this.label.setBox(
      innerX - this.view,
      innerY,
      this.label.measured.width,
      innerH,
    );
    this.bar.setBox(
      innerX + caretX - this.view,
      innerY,
      Math.max(1, this.caretWidth * scale),
      innerH,
    );
  }

  /** kliknięcie stawia kursor pod myszą */
  public onPress(mouse: Position2D) {
    const scale = Navi.getScale;
    const originX =
      this.pixelBox.x + this.style.padding.left * scale - this.view;
    const target = mouse.x - originX;

    let best = 0;
    let bestDist = Math.abs(target);
    for (let i = 1; i <= this.value.length; i++) {
      const dist = Math.abs(
        this.widthOf(this.value.slice(0, i), scale) - target,
      );
      if (dist >= bestDist) continue;
      bestDist = dist;
      best = i;
    }
    this.caret = best;
    this.restartBlink();
    Navi.markLayoutDirty();
  }

  public onKeys(input: KeyInput) {
    let touched = false;

    for (const key of input.keys) {
      switch (key) {
        case "Backspace":
          if (this.caret === 0) break;
          this.value =
            this.value.slice(0, this.caret - 1) + this.value.slice(this.caret);
          this.caret--;
          touched = true;
          break;
        case "Delete":
          this.value =
            this.value.slice(0, this.caret) + this.value.slice(this.caret + 1);
          touched = true;
          break;
        case "ArrowLeft":
          this.caret = Math.max(0, this.caret - 1);
          touched = true;
          break;
        case "ArrowRight":
          this.caret = Math.min(this.value.length, this.caret + 1);
          touched = true;
          break;
        case "Home":
          this.caret = 0;
          touched = true;
          break;
        case "End":
          this.caret = this.value.length;
          touched = true;
          break;
        case "Enter":
          this.onSubmit?.(this.value);
          if (this.blurOnSubmit) Navi.blur();
          return;
      }
    }

    if (input.text.length > 0) {
      const room = this.maxLength - this.value.length;
      const add = input.text.slice(0, Math.max(0, room));
      if (add.length > 0) {
        this.value =
          this.value.slice(0, this.caret) + add + this.value.slice(this.caret);
        this.caret += add.length;
        touched = true;
      }
    }

    if (!touched) return;
    this.restartBlink();
    Navi.markLayoutDirty(); // ruch kursora bez zmiany tekstu też przestawia widok
  }

  private restartBlink() {
    if (this.blink) this.blink.elapsed = 0; // kreska stoi twardo, gdy piszesz
  }
}
