import AABB from "./AABB";

type QuadTreeItem<T> = { bounds: Box | BoxAABB; data: T };

export default class FrameQuadTree<T> {
  private static readonly MAX_OBJECTS = 8;
  private static readonly MAX_DEPTH = 6;

  private bounds: BoxAABB;
  private depth: number;
  private objects: QuadTreeItem<T>[] = [];
  private children:
    | [FrameQuadTree<T>, FrameQuadTree<T>, FrameQuadTree<T>, FrameQuadTree<T>]
    | null = null;

  constructor(bounds: Box | BoxAABB, depth = 0) {
    this.bounds = FrameQuadTree.normalizeBounds(bounds);
    this.depth = depth;
  }

  private static normalizeBounds(shape: Box | BoxAABB): BoxAABB {
    if ("min" in shape) return shape;
    return {
      min: { x: shape.x, y: shape.y },
      max: { x: shape.x + shape.w, y: shape.y + shape.h },
    };
  }

  clear() {
    this.objects = [];
    this.children = null;
  }

  insert(item: QuadTreeItem<T>) {
    if (this.children) {
      const index = this.getChildIndexContaining(item.bounds);
      if (index !== -1) {
        this.children[index].insert(item);
        return;
      }
      this.objects.push(item);
      return;
    }

    this.objects.push(item);

    if (
      this.objects.length > FrameQuadTree.MAX_OBJECTS &&
      this.depth < FrameQuadTree.MAX_DEPTH
    ) {
      this.split();
    }
  }

  private split() {
    const { min, max } = this.bounds;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;

    this.children = [
      new FrameQuadTree(
        { min: { x: min.x, y: min.y }, max: { x: midX, y: midY } },
        this.depth + 1,
      ),
      new FrameQuadTree(
        { min: { x: midX, y: min.y }, max: { x: max.x, y: midY } },
        this.depth + 1,
      ),
      new FrameQuadTree(
        { min: { x: min.x, y: midY }, max: { x: midX, y: max.y } },
        this.depth + 1,
      ),
      new FrameQuadTree(
        { min: { x: midX, y: midY }, max: { x: max.x, y: max.y } },
        this.depth + 1,
      ),
    ];

    const remaining: QuadTreeItem<T>[] = [];
    for (const obj of this.objects) {
      const index = this.getChildIndexContaining(obj.bounds);
      if (index !== -1) this.children[index].insert(obj);
      else remaining.push(obj);
    }
    this.objects = remaining;
  }

  private getChildIndexContaining(bounds: Box | BoxAABB): number {
    if (!this.children) return -1;
    const normalized = FrameQuadTree.normalizeBounds(bounds);
    for (let i = 0; i < 4; i++) {
      if (AABB.contains(this.children[i].bounds, normalized)) return i;
    }
    return -1;
  }

  query(range: Box | BoxAABB, result: T[] = []): T[] {
    if (!AABB.overlaps(this.bounds, range)) return result;

    for (const obj of this.objects) {
      if (AABB.overlaps(obj.bounds, range)) result.push(obj.data);
    }

    if (this.children) {
      for (const child of this.children) child.query(range, result);
    }

    return result;
  }
  forEachNode(
    cb: (bounds: BoxAABB, depth: number, objectCount: number) => void,
  ) {
    cb(this.bounds, this.depth, this.objects.length);
    if (this.children) for (const c of this.children) c.forEachNode(cb);
  }
}
