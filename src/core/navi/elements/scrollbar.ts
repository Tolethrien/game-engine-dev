import AxiomMath from "@/core/axiom/math";
import Navi from "../navi";
import UINode, { NodeProps } from "../node";

export interface ScrollBarProps extends NodeProps {
  thumb?: NodeProps;
  minThumb?: number;
  thumbLength?: number;
}

class UIScrollThumb extends UINode {
  public onDrag(delta: Position2D) {
    (this.parent as UIScrollBar | undefined)?.onDrag(delta);
  }
}

export default class UIScrollBar extends UINode {
  public readonly thumb: UINode;
  private minThumb: number;
  private thumbLength: number | undefined;
  constructor(
    private target: UINode,
    private axis: "x" | "y",
    props: ScrollBarProps = {},
  ) {
    super(props);
    this.minThumb = props.minThumb ?? 20;
    this.thumbLength = props.thumbLength;
    this.thumb = new UIScrollThumb(props.thumb ?? {});
    // part of the bar itself, so it skips the append queue
    this.thumb.parent = this;
    this.children.push(this.thumb);
  }

  private get vertical() {
    return this.axis === "y";
  }

  /** the rail the thumb runs along — the bar's own padding insets it */
  private track(): Box {
    const scale = Navi.getScale;
    const p = this.style.padding;
    return {
      x: this.pixelBox.x + p.left * scale,
      y: this.pixelBox.y + p.top * scale,
      w: this.pixelBox.w - (p.left + p.right) * scale,
      h: this.pixelBox.h - (p.top + p.bottom) * scale,
    };
  }

  private travel() {
    const track = this.track();
    const trackLength = this.vertical ? track.h : track.w;
    const thumbLength = this.vertical
      ? this.thumb.pixelBox.h
      : this.thumb.pixelBox.w;
    return trackLength - thumbLength;
  }

  private setScroll(value: number) {
    const max = this.target.maxScroll(this.axis);
    const clamped = AxiomMath.clamp(value, -max, 0);
    if (this.vertical) this.target.scrollOffset.y = clamped;
    else this.target.scrollOffset.x = clamped;
    Navi.markLayoutDirty();
    Navi.markScrolled();
  }

  /** clicking the track drops the thumb under the cursor and keeps dragging from there */
  public onPress(mouse: Position2D) {
    const max = this.target.maxScroll(this.axis);
    const travel = this.travel();
    if (max === 0 || travel <= 0) return;

    const track = this.track();
    const thumbLength = this.vertical
      ? this.thumb.pixelBox.h
      : this.thumb.pixelBox.w;
    const start = this.vertical ? track.y : track.x;
    const at = (this.vertical ? mouse.y : mouse.x) - start - thumbLength / 2;

    this.setScroll(-AxiomMath.clamp(at / travel, 0, 1) * max);
  }

  public onDrag(delta: Position2D) {
    const max = this.target.maxScroll(this.axis);
    const travel = this.travel();
    if (max === 0 || travel <= 0) return;

    // the thumb crosses `travel` pixels while the content crosses `max`
    const moved = (this.vertical ? delta.y : delta.x) * (max / travel);
    const current = this.vertical
      ? this.target.scrollOffset.y
      : this.target.scrollOffset.x;
    this.setScroll(current - moved);
  }

  public layoutChildren(scale: number) {
    const track = this.track();
    const trackLength = this.vertical ? track.h : track.w;

    const viewLength = this.vertical
      ? this.target.pixelBox.h
      : this.target.pixelBox.w;
    const contentLength = this.vertical
      ? this.target.contentSize.height
      : this.target.contentSize.width;

    let thumbLength = trackLength;
    if (this.thumbLength !== undefined) {
      thumbLength = this.thumbLength * scale;
    } else if (contentLength > 0) {
      thumbLength = trackLength * (viewLength / contentLength);
    }
    thumbLength = AxiomMath.clamp(
      thumbLength,
      this.minThumb * scale,
      trackLength,
    );

    const max = this.target.maxScroll(this.axis);
    const scrolled = this.vertical
      ? this.target.scrollOffset.y
      : this.target.scrollOffset.x;
    const norm = max > 0 ? -scrolled / max : 0;
    const offset = norm * (trackLength - thumbLength);

    if (this.vertical) {
      this.thumb.setBox(track.x, track.y + offset, track.w, thumbLength);
    } else {
      this.thumb.setBox(track.x + offset, track.y, thumbLength, track.h);
    }
  }
}
