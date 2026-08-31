import Draw from "@/core/aurora/draw";
import { Anchor, createStyle, mergeStyle, Style } from "./style";
import { px, toPx, Unit, UnitPosition2D, Units, UnitSize2D } from "./units";
import Navi from "./navi";
import { deepMerge } from "@/utils/utils";
import AxiomMath from "../axiom/math";
import { Tween } from "./tween";
type Axis = "x" | "y";
export type InputMode = "normal" | "none" | "absorb" | "disabled";
export interface KeyInput {
  text: string;
  keys: readonly string[];
}
export interface NodeProps {
  position?: Partial<UnitPosition2D>;
  size?: Partial<UnitSize2D>;
  minSize?: Partial<UnitSize2D>;
  maxSize?: Partial<UnitSize2D>;
  input?: InputMode;
  wantsKeys?: boolean;
  focusable?: boolean;
  style?: DeepPartial<Style>;
  states?: NodeStates;
  inheritState?: boolean;
  portal?: boolean;
}
export interface MotionProps {
  scale: Position2D;
  offset: Position2D;
  alpha: number;
}
export interface NodeStates {
  hovered?: DeepPartial<Style>;
  pressed?: DeepPartial<Style>;
  focused?: DeepPartial<Style>;
  disabled?: DeepPartial<Style>;
}
export default class UINode {
  public parent: UINode | undefined;
  public children: UINode[] = [];
  public style: Style;
  public portal: boolean;
  private hoveredStyle: Style | undefined;
  private pressedStyle: Style | undefined;
  private focusedStyle: Style | undefined;
  private disabledStyle: Style | undefined;
  public inheritState: boolean;
  public tags: Set<string> = new Set();
  public position: UnitPosition2D;
  public size: UnitSize2D;
  public minSize: Partial<UnitSize2D>;
  public maxSize: Partial<UnitSize2D>;
  public scrollOffset: Position2D = { x: 0, y: 0 };
  public contentSize: Size2D = { width: 0, height: 0 };

  public pixelBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  public measured: Size2D = { width: 0, height: 0 };
  public input: InputMode;
  public wantsKeys: boolean;
  public drawAlpha = 1;
  public active = true;
  public hovered = false;
  public hoveredWithin = false;
  public entered = false;
  public enteredWithin = false;
  public left = false;
  public leftWithin = false;
  public pressed = false;
  public clicked = false;
  public clickedWithin = false;
  public doubleClicked = false;
  public doubleClickedWithin = false;
  public rightPressed = false;
  public rightClicked = false;
  public rightClickedWithin = false;
  public focusable = false;
  public focused = false;
  public focusedWithin = false;
  public focusGained = false;
  public focusLost = false;
  private painted: Style | undefined; // render while blending
  private blendFrom: Style | undefined;
  private blendTo: Style | undefined; // target
  private blend = 1;
  public flippedX = false;
  public flippedY = false;
  public motion: MotionProps = {
    scale: { x: 1, y: 1 },
    offset: { x: 0, y: 0 },
    alpha: 1,
  };
  private tweens: Tween[] = [];
  constructor(props: NodeProps = {}) {
    this.portal = props.portal ?? false;
    this.wantsKeys = props.wantsKeys ?? false;
    this.position = {
      x: props.position?.x ?? px(0),
      y: props.position?.y ?? px(0),
    };
    this.size = {
      width: props.size?.width ?? px(0),
      height: props.size?.height ?? px(0),
    };
    this.minSize = {
      width: props.minSize?.width,
      height: props.minSize?.height,
    };
    this.maxSize = {
      width: props.maxSize?.width,
      height: props.maxSize?.height,
    };
    this.style = createStyle(
      deepMerge(this.styleDefaults(), props.style ?? {}) as DeepPartial<Style>,
    );
    this.input = props.input ?? "normal";
    this.focusable = props.focusable ?? false;
    this.inheritState = props.inheritState ?? false;
    const states = props.states;
    if (states?.hovered)
      this.hoveredStyle = mergeStyle(this.style, states.hovered);
    if (states?.pressed)
      this.pressedStyle = mergeStyle(this.style, states.pressed);
    if (states?.focused)
      this.focusedStyle = mergeStyle(this.style, states.focused);
    if (states?.disabled)
      this.disabledStyle = mergeStyle(this.style, states.disabled);

    if (this.wantsStyleAnimation()) Navi.registerAnimated(this);
  }
  //overrides
  protected styleDefaults(): DeepPartial<Style> {
    return {}; //change styles
  }
  public onMount() {}
  public onUnmount() {}
  public onDrag(delta: Position2D) {} //scroll
  public onPress(mouse: Position2D) {} // input
  public onKeys(input: KeyInput) {} // keyboard
  public tick(dt: number) {} // well... tick xD
  public contentChanged() {
    // actual content passed to node from game

    return false;
  }

  //main draw for basic node - can be super or override
  public draw(box: Box) {
    const style = this.paintStyle;
    const position = { x: box.x, y: box.y };
    const size = { width: box.w, height: box.h };
    const { rounded, backgroundImage, backgroundImageCrop } = style;
    const tint = this.fade(style.backgroundColor);
    if (backgroundImage) {
      Draw.guiRect({
        position,
        size,
        tint,
        rounded,
        background: backgroundImage,
        crop: backgroundImageCrop,
      });
    } else {
      Draw.guiRect({ position, size, tint, rounded });
    }
  }

  public setActive(value: boolean) {
    if (this.active === value) return;
    this.active = value;
    if (value) Navi.markLayoutDirty();
    else Navi.releaseInput(this);
  }

  public get activeStyle(): Style {
    const from = this.stateSource;
    if (from.input === "disabled" && this.disabledStyle)
      return this.disabledStyle;
    if (from.pressed && this.pressedStyle) return this.pressedStyle;
    if (from.hovered && this.hoveredStyle) return this.hoveredStyle;
    if (from.focused && this.focusedStyle) return this.focusedStyle;
    return this.style;
  }
  private get stateSource(): UINode {
    if (this.inheritState && this.parent) return this.parent.stateSource;
    return this;
  }
  public get paintStyle(): Style {
    if (this.blend < 1 && this.painted) return this.painted;
    return this.activeStyle;
  }
  public get renderAlpha() {
    return this.motion.alpha;
  }
  public get renderNudgeX() {
    return this.paintStyle.nudge.x + this.motion.offset.x;
  }
  public get renderNudgeY() {
    return this.paintStyle.nudge.y + this.motion.offset.y;
  }
  public get renderScaleX() {
    return this.paintStyle.scale.x * this.motion.scale.x;
  }
  public get renderScaleY() {
    return this.paintStyle.scale.y * this.motion.scale.y;
  }
  public get renderOriginX() {
    const origin = this.paintStyle.origin.x;
    return this.flippedX ? 1 - origin : origin;
  }
  public get renderOriginY() {
    const origin = this.paintStyle.origin.y;
    return this.flippedY ? 1 - origin : origin;
  }
  public get isTweening() {
    return this.tweens.length > 0;
  }
  public get indexInParent() {
    if (!this.parent) return -1;
    return this.parent.children.indexOf(this);
  }
  protected get paintTextColor(): RGBA {
    return this.fade(this.paintStyle.textColor);
  }

  public measureSelf(scale: number) {
    const padding = this.style.padding;
    const padX = (padding.left + padding.right) * scale;
    const padY = (padding.top + padding.bottom) * scale;

    this.contentSize.width = this.measureContentAxis("x", scale) + padX;
    this.contentSize.height = this.measureContentAxis("y", scale) + padY;

    this.measured.width = this.clampAxis(
      this.measureAxis(this.size.width, "x", scale),
      "x",
      0,
      0,
      scale,
      false,
    );
    this.measured.height = this.clampAxis(
      this.measureAxis(this.size.height, "y", scale),
      "y",
      0,
      0,
      scale,
      false,
    );
  }
  public setBox(x: number, y: number, w: number, h: number) {
    this.pixelBox.x = x;
    this.pixelBox.y = y;
    this.pixelBox.w = w;
    this.pixelBox.h = h;
  }
  /**to do something for all children if we need */
  public forEachDescendant(action: (node: UINode) => void) {
    action(this);
    for (const child of this.children) child.forEachDescendant(action);
  }
  public isDescendantOf(other: UINode) {
    let walk = this.parent;
    while (walk) {
      if (walk === other) return true;
      walk = walk.parent;
    }
    return false;
  }
  public layoutChildren(scale: number) {
    if (this.children.length === 0) return;

    const padding = this.style.padding;

    const innerX = this.pixelBox.x + padding.left * scale;
    const innerY = this.pixelBox.y + padding.top * scale;
    const innerW =
      this.pixelBox.w - padding.left * scale - padding.right * scale;
    const innerH =
      this.pixelBox.h - padding.top * scale - padding.bottom * scale;

    switch (this.style.layout) {
      case "stack":
        this.layoutStack(innerX, innerY, innerW, innerH, scale);
        break;
      case "grid":
        this.layoutGrid(innerX, innerY, innerW, innerH, scale);
        break;
      default:
        this.layoutFree(innerX, innerY, innerW, innerH, scale);
        break;
    }
  }

  public play(tween: Tween) {
    tween.elapsed = 0;
    this.tweens.push(tween);
    Navi.registerAnimated(this);
    return tween;
  }

  public stopTween(tween: Tween) {
    const i = this.tweens.indexOf(tween);
    if (i === -1) return;
    this.tweens.splice(i, 1);
    if (this.tweens.length === 0) this.resetMotion();
  }

  public stopAllTweens() {
    if (this.tweens.length === 0) return;
    this.tweens.length = 0;
    this.resetMotion();
  }
  public tickTweens(dt: number, done: (() => void)[]) {
    if (this.tweens.length === 0) return;

    let sx = 1;
    let sy = 1;
    let ox = 0;
    let oy = 0;
    let a = 1;
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tween = this.tweens[i];
      tween.elapsed += dt * 1000;
      const live = tween.elapsed - tween.delay;

      let t: number;
      if (live <= 0) t = 0;
      else if (tween.ms <= 0) t = 1;
      else if (live >= tween.ms)
        t = tween.loop ? (live % tween.ms) / tween.ms : 1;
      else t = live / tween.ms;

      const s = tween.sample(t);
      sx *= s.scaleX ?? 1;
      sy *= s.scaleY ?? 1;
      ox += s.x ?? 0;
      oy += s.y ?? 0;
      a *= s.alpha ?? 1;

      if (!tween.loop && live >= tween.ms) {
        this.tweens.splice(i, 1);
        if (tween.onDone) done.push(tween.onDone);
      }
    }
    this.motion.scale.x = sx;
    this.motion.scale.y = sy;
    this.motion.offset.x = ox;
    this.motion.offset.y = oy;
    this.motion.alpha = a;
  }
  public maxScroll(axis: Axis) {
    if (axis === "x")
      return Math.max(0, this.contentSize.width - this.pixelBox.w);
    return Math.max(0, this.contentSize.height - this.pixelBox.h);
  }
  public tickStyle(dt: number) {
    const target = this.activeStyle;

    if (target !== this.blendTo) {
      const previous =
        this.blend < 1 && this.painted ? this.painted : this.blendTo;

      if (target.transitionMs <= 0 || previous === undefined) {
        this.blendTo = target;
        this.blend = 1;
        return;
      }

      this.blendFrom = structuredClone(previous);
      this.painted = structuredClone(target);
      this.blendTo = target;
      this.blend = 0;
    }

    if (this.blend >= 1) return;
    if (!this.painted || !this.blendFrom || !this.blendTo) return;

    this.blend = Math.min(
      1,
      this.blend + (dt * 1000) / this.blendTo.transitionMs,
    );
    const t = this.blend;

    this.painted.backgroundColor = AxiomMath.lerpRGBA(
      this.blendFrom.backgroundColor,
      this.blendTo.backgroundColor,
      t,
    );
    this.painted.textColor = AxiomMath.lerpRGBA(
      this.blendFrom.textColor,
      this.blendTo.textColor,
      t,
    );
    this.painted.rounded = AxiomMath.lerp(
      this.blendFrom.rounded,
      this.blendTo.rounded,
      t,
    );
    this.painted.scale = AxiomMath.lerpPos2D(
      this.blendFrom.scale,
      this.blendTo.scale,
      t,
    );
    this.painted.nudge = AxiomMath.lerpPos2D(
      this.blendFrom.nudge,
      this.blendTo.nudge,
      t,
    );
  }
  protected fade(color: RGBA): RGBA {
    if (this.drawAlpha >= 1) return color;
    return [color[0], color[1], color[2], color[3] * this.drawAlpha];
  }
  protected clampAxis(
    value: number,
    axis: Axis,
    parentW: number,
    parentH: number,
    scale: number,
    allowPercent: boolean,
  ) {
    const min = axis === "x" ? this.minSize.width : this.minSize.height;
    const max = axis === "x" ? this.maxSize.width : this.maxSize.height;
    let result = value;

    if (max !== undefined) {
      const limit = this.limitToPx(max, parentW, parentH, scale, allowPercent);
      if (limit !== undefined && result > limit) result = limit;
    }
    if (min !== undefined) {
      const limit = this.limitToPx(min, parentW, parentH, scale, allowPercent);
      if (limit !== undefined && result < limit) result = limit;
    }
    return result;
  }
  protected visualScale(box: Box): Position2D {
    return {
      x: this.pixelBox.w > 0 ? box.w / this.pixelBox.w : 1,
      y: this.pixelBox.h > 0 ? box.h / this.pixelBox.h : 1,
    };
  }

  private layoutFree(
    innerX: number,
    innerY: number,
    innerW: number,
    innerH: number,
    scale: number,
  ) {
    for (const child of this.children) {
      const style = child.style;

      let childX: number;
      let childW: number;
      if (style.anchorX === "stretch") {
        const left = style.inset.left * scale;
        const right = style.inset.right * scale;
        childX = innerX + left;
        childW = child.clampAxis(
          innerW - left - right,
          "x",
          innerW,
          innerH,
          scale,
          true,
        );
      } else {
        childW = child.resolveSize(
          child.size.width,
          innerW,
          innerH,
          scale,
          "x",
        );
        const offsetX = toPx(child.position.x, innerW, innerH, scale);
        childX =
          innerX + this.anchorOffset(style.anchorX, innerW, childW, offsetX);
      }

      let childY: number;
      let childH: number;
      if (style.anchorY === "stretch") {
        const top = style.inset.top * scale;
        const bottom = style.inset.bottom * scale;
        childY = innerY + top;
        childH = child.clampAxis(
          innerH - top - bottom,
          "y",
          innerW,
          innerH,
          scale,
          true,
        );
      } else {
        childH = child.resolveSize(
          child.size.height,
          innerW,
          innerH,
          scale,
          "y",
        );
        const offsetY = toPx(child.position.y, innerW, innerH, scale);
        childY =
          innerY + this.anchorOffset(style.anchorY, innerH, childH, offsetY);
      }

      child.setBox(childX, childY, childW, childH);
    }
  }
  private layoutStack(
    innerX: number,
    innerY: number,
    innerW: number,
    innerH: number,
    scale: number,
  ) {
    const isRow = this.style.direction === "row";
    const gap = this.style.gap * scale;
    const count = this.children.length;

    const widths: number[] = [];
    const heights: number[] = [];
    let usedMain = gap * (count - 1);

    for (const child of this.children) {
      const childW = child.resolveSize(
        child.size.width,
        innerW,
        innerH,
        scale,
        "x",
      );
      const childH = child.resolveSize(
        child.size.height,
        innerW,
        innerH,
        scale,
        "y",
      );
      widths.push(childW);
      heights.push(childH);
      if (isRow) usedMain += childW;
      else usedMain += childH;
    }

    let mainSpace = innerH;
    let crossSpace = innerW;
    if (isRow) {
      mainSpace = innerW;
      crossSpace = innerH;
    }

    const freeSpace = mainSpace - usedMain;
    let cursor = 0;
    let step = gap;

    if (this.style.alignMain === "center") cursor = freeSpace / 2;
    else if (this.style.alignMain === "end") cursor = freeSpace;
    else if (this.style.alignMain === "between" && count > 1) {
      step = gap + freeSpace / (count - 1);
    }

    for (let i = 0; i < count; i++) {
      const child = this.children[i];
      let childW = widths[i];
      let childH = heights[i];

      const align = child.style.alignSelf ?? this.style.alignCross;
      if (align === "stretch") {
        if (isRow)
          childH = child.clampAxis(innerH, "y", innerW, innerH, scale, true);
        else childW = child.clampAxis(innerW, "x", innerW, innerH, scale, true);
      }

      let mainSize = childH;
      let crossSize = childW;
      if (isRow) {
        mainSize = childW;
        crossSize = childH;
      }

      let crossPos = 0;
      if (align === "center") crossPos = (crossSpace - crossSize) / 2;
      else if (align === "end") crossPos = crossSpace - crossSize;

      let childX = innerX + crossPos;
      let childY = innerY + cursor;
      if (isRow) {
        childX = innerX + cursor;
        childY = innerY + crossPos;
      }

      childX += toPx(child.position.x, innerW, innerH, scale);
      childY += toPx(child.position.y, innerW, innerH, scale);

      child.setBox(childX, childY, childW, childH);
      cursor += mainSize + step;
    }
  }
  private layoutGrid(
    innerX: number,
    innerY: number,
    innerW: number,
    innerH: number,
    scale: number,
  ) {
    const perLine = Math.max(1, this.style.gridCount);
    const isRow = this.style.direction === "row";
    const gap = this.style.gap * scale;
    const gapCross = this.style.gapCross * scale;

    let cellW = 0;
    let cellH = 0;
    for (const child of this.children) {
      if (child.measured.width > cellW) cellW = child.measured.width;
      if (child.measured.height > cellH) cellH = child.measured.height;
    }

    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i];
      const line = Math.floor(i / perLine);
      const slot = i % perLine;

      let cellX: number;
      let cellY: number;
      if (isRow) {
        cellX = innerX + slot * (cellW + gap);
        cellY = innerY + line * (cellH + gapCross);
      } else {
        cellX = innerX + line * (cellW + gapCross);
        cellY = innerY + slot * (cellH + gap);
      }

      let childW = cellW;
      if (this.style.cellAlignX !== "stretch") {
        childW = child.resolveSize(child.size.width, cellW, cellH, scale, "x");
      } else {
        childW = child.clampAxis(cellW, "x", cellW, cellH, scale, true);
      }

      let childH = cellH;
      if (this.style.cellAlignY !== "stretch") {
        childH = child.resolveSize(child.size.height, cellW, cellH, scale, "y");
      } else {
        childH = child.clampAxis(cellH, "y", cellW, cellH, scale, true);
      }

      const offsetX = toPx(child.position.x, cellW, cellH, scale);
      const offsetY = toPx(child.position.y, cellW, cellH, scale);

      child.setBox(
        cellX +
          this.anchorOffset(this.style.cellAlignX, cellW, childW, offsetX),
        cellY +
          this.anchorOffset(this.style.cellAlignY, cellH, childH, offsetY),
        childW,
        childH,
      );
    }
  }

  private isMainAxis(axis: Axis) {
    if (this.style.layout !== "stack") return false;
    if (this.style.direction === "row") return axis === "x";
    return axis === "y";
  }

  private childSizeOnAxis(child: UINode, axis: Axis) {
    if (axis === "x") return child.measured.width;
    return child.measured.height;
  }
  private measureAxis(unit: Unit, axis: Axis, scale: number) {
    if (unit.unit === Units.px) return unit.value * scale;
    if (unit.unit !== Units.auto) return 0;
    if (axis === "x") return this.contentSize.width;
    return this.contentSize.height;
  }
  private measureContentAxis(axis: Axis, scale: number) {
    if (this.children.length === 0) return 0;
    switch (this.style.layout) {
      case "stack":
        return this.measureStackAxis(axis, scale);
      case "grid":
        return this.measureGridAxis(axis, scale);
      default:
        return this.measureFreeAxis(axis, scale);
    }
  }
  private measureStackAxis(axis: Axis, scale: number) {
    if (this.isMainAxis(axis)) {
      let sum = 0;
      for (const child of this.children) {
        sum += this.childSizeOnAxis(child, axis);
      }
      return sum + this.style.gap * scale * (this.children.length - 1);
    }

    let biggest = 0;
    for (const child of this.children) {
      const size = this.childSizeOnAxis(child, axis);
      if (size > biggest) biggest = size;
    }
    return biggest;
  }
  private measureFreeAxis(axis: Axis, scale: number) {
    let furthest = 0;

    for (const child of this.children) {
      const anchor = axis === "x" ? child.style.anchorX : child.style.anchorY;
      if (anchor === "stretch") continue;

      let edge = this.childSizeOnAxis(child, axis);
      if (anchor === "start" || anchor === "end") {
        const unit = axis === "x" ? child.position.x : child.position.y;
        edge += toPx(unit, 0, 0, scale);
      }

      if (edge > furthest) furthest = edge;
    }
    return furthest;
  }
  private measureGridAxis(axis: Axis, scale: number) {
    const perLine = Math.max(1, this.style.gridCount);
    const lines = Math.ceil(this.children.length / perLine);
    const inLine = Math.min(this.children.length, perLine);

    let cell = 0;
    for (const child of this.children) {
      const size = this.childSizeOnAxis(child, axis);
      if (size > cell) cell = size;
    }

    let flowsAlongThisAxis: boolean;
    if (this.style.direction === "row") flowsAlongThisAxis = axis === "x";
    else flowsAlongThisAxis = axis === "y";
    const count = flowsAlongThisAxis ? inLine : lines;
    const gap = flowsAlongThisAxis ? this.style.gap : this.style.gapCross;

    return count * cell + gap * scale * (count - 1);
  }

  private anchorOffset(
    anchor: Anchor,
    space: number,
    size: number,
    offset: number,
  ) {
    switch (anchor) {
      case "end":
        return space - size - offset;
      case "center":
        return (space - size) / 2 + offset;
      default:
        return offset;
    }
  }

  private limitToPx(
    unit: Unit,
    parentW: number,
    parentH: number,
    scale: number,
    allowPercent: boolean,
  ) {
    if (unit.unit === Units.px) return unit.value * scale;
    if (!allowPercent) return undefined;
    if (unit.unit === Units.pw) return unit.value * (parentW / 100);
    if (unit.unit === Units.ph) return unit.value * (parentH / 100);
    return undefined;
  }
  private resolveSize(
    unit: Unit,
    innerW: number,
    innerH: number,
    scale: number,
    axis: Axis,
  ) {
    let value = 0;
    switch (unit.unit) {
      case Units.px:
        value = unit.value * scale;
        break;
      case Units.pw:
        value = unit.value * (innerW / 100);
        break;
      case Units.ph:
        value = unit.value * (innerH / 100);
        break;
      case Units.auto:
        value = axis === "x" ? this.measured.width : this.measured.height;
        break;
    }
    return this.clampAxis(value, axis, innerW, innerH, scale, true);
  }

  private wantsStyleAnimation() {
    const states = [
      this.hoveredStyle,
      this.pressedStyle,
      this.focusedStyle,
      this.disabledStyle,
    ];

    let hasState = false;
    for (const style of states) {
      if (!style) continue;
      hasState = true;
      if (style.transitionMs > 0) return true;
    }
    if (!hasState) return false;

    return this.style.transitionMs > 0;
  }

  private resetMotion() {
    this.motion.scale.x = 1;
    this.motion.scale.y = 1;
    this.motion.offset.x = 0;
    this.motion.offset.y = 0;
    this.motion.alpha = 1;
  }
}
