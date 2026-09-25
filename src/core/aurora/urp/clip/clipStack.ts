import { assert } from "@axiom/utils";
import { debug } from "@debug";
import AABB, { Bounds } from "@/core/axiom/AABB";
import type ClipBuffer from "./clipBuffer";
import { CLIP, ClipShape, DrawClip } from "./clip";

// aabb of this clip and all its parents, empty when they do not overlap
interface ClipLevel extends Bounds {
  id: number;
}
// covers the antialiasing margin and anchor snapping of an instance
const CULL_MARGIN = 2;

// pushClip / popClip state of one draw api, the geometry itself goes to the pass ClipBuffer
export default class ClipStack {
  private readonly levels: ClipLevel[] = [];
  private depth = 0;
  private readonly owner: string;
  private readonly balanceWarning = debug.log.scope("auroraURP").once();
  private readonly shape: ClipShape = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    rotation: 0,
    radius: [0, 0, 0, 0],
  };

  constructor(owner: string) {
    this.owner = owner;
  }

  public get getCurrentId() {
    return this.depth > 0 ? this.levels[this.depth - 1].id : 0;
  }

  // buffer is null while the api has no pass yet: the level still stacks, with no clip id
  public push(props: DrawClip, buffer: ClipBuffer | null) {
    const { position, size, rotation = 0, rounded = 0, inset = 0 } = props;
    assert(
      this.depth < CLIP.maxDepth,
      `${this.owner}.pushClip: more than ${CLIP.maxDepth} nested clips`,
    );
    const shape = this.shape;
    shape.width = Math.max(size.width - inset * 2, 0);
    shape.height = Math.max(size.height - inset * 2, 0);
    shape.x = position.x + inset;
    shape.y = position.y + inset;
    shape.rotation = rotation;
    const outerMax = Math.min(size.width, size.height) / 2;
    const innerMax = Math.min(shape.width, shape.height) / 2;
    for (let i = 0; i < 4; i++) {
      const corner = typeof rounded === "number" ? rounded : rounded[i];
      const radius = Math.max(Math.min(corner, outerMax) - inset, 0);
      shape.radius[i] = Math.min(radius, innerMax);
    }

    const parent = this.depth > 0 ? this.levels[this.depth - 1] : null;
    let level = this.levels[this.depth];
    if (!level) {
      level = { id: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
      this.levels.push(level);
    }
    this.depth++;
    level.id = buffer?.push(shape, parent?.id ?? 0) ?? 0;

    AABB.rotatedBounds(
      level,
      shape.x + shape.width / 2,
      shape.y + shape.height / 2,
      shape.width,
      shape.height,
      rotation,
    );
    if (parent) {
      level.minX = Math.max(level.minX, parent.minX);
      level.minY = Math.max(level.minY, parent.minY);
      level.maxX = Math.min(level.maxX, parent.maxX);
      level.maxY = Math.min(level.maxY, parent.maxY);
    }
    if (shape.width === 0 || shape.height === 0) level.maxX = level.minX;
  }

  public pop() {
    assert(this.depth > 0, `${this.owner}.popClip without a matching pushClip`);
    this.depth--;
  }

  // shape lies fully outside the current clip, drawing it would only be cut away
  public culled(bounds: Bounds) {
    if (this.depth === 0) return false;
    const clip = this.levels[this.depth - 1];
    return (
      clip.minX >= clip.maxX ||
      clip.minY >= clip.maxY ||
      bounds.maxX + CULL_MARGIN < clip.minX ||
      bounds.minX - CULL_MARGIN > clip.maxX ||
      bounds.maxY + CULL_MARGIN < clip.minY ||
      bounds.minY - CULL_MARGIN > clip.maxY
    );
  }

  // a frame that ends with open clips would leak them into the next one
  public reset() {
    if (this.depth !== 0) {
      this.balanceWarning.warn(
        `${this.owner}: ${this.depth} pushClip without popClip at the end of a frame, the stack is reset`,
      );
    }
    this.depth = 0;
  }
}
