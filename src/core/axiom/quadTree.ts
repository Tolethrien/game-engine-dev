import AABB from "./AABB";

type QuadTreeItem<T> = { id: string | number; bounds: Box | BoxAABB; data: T };
type QuadTreeEntry<T> = { node: QuadTree<T>; item: QuadTreeItem<T> };

export default class QuadTree<T> {
  private static readonly MAX_OBJECTS = 8;
  private static readonly MAX_DEPTH = 6;

  private bounds: BoxAABB;
  private depth: number;
  private objects: QuadTreeItem<T>[] = [];
  private children:
    | [QuadTree<T>, QuadTree<T>, QuadTree<T>, QuadTree<T>]
    | null = null;
  private registry: Map<string | number, QuadTreeEntry<T>>;

  constructor(
    bounds: Box | BoxAABB,
    depth = 0,
    registry?: Map<string | number, QuadTreeEntry<T>>,
  ) {
    this.bounds = QuadTree.normalizeBounds(bounds);
    this.depth = depth;
    this.registry = registry ?? new Map();
  }

  private static normalizeBounds(shape: Box | BoxAABB): BoxAABB {
    if ("min" in shape) return shape;
    return {
      min: { x: shape.x, y: shape.y },
      max: { x: shape.x + shape.w, y: shape.y + shape.h },
    };
  }

  insert(item: QuadTreeItem<T>) {
    if (this.children) {
      const index = this.getChildIndexContaining(item.bounds);
      if (index !== -1) {
        this.children[index].insert(item);
        return;
      }
      this.objects.push(item);
      this.registry.set(item.id, { node: this, item });
      return;
    }

    this.objects.push(item);
    this.registry.set(item.id, { node: this, item });

    if (
      this.objects.length > QuadTree.MAX_OBJECTS &&
      this.depth < QuadTree.MAX_DEPTH
    ) {
      this.split();
    }
  }

  remove(id: string | number) {
    const entry = this.registry.get(id);
    if (!entry) return false;
    const index = entry.node.objects.indexOf(entry.item);
    if (index !== -1) entry.node.objects.splice(index, 1);
    this.registry.delete(id);
    return true;
  }

  move(id: string | number, newBounds: Box | BoxAABB) {
    const entry = this.registry.get(id);
    if (!entry) return false;

    const node = entry.node;
    const normalized = QuadTree.normalizeBounds(newBounds);

    if (AABB.contains(node.bounds, normalized)) {
      entry.item.bounds = newBounds;

      const childIndex = node.getChildIndexContaining(newBounds);
      if (childIndex !== -1) {
        const index = node.objects.indexOf(entry.item);
        if (index !== -1) node.objects.splice(index, 1);
        node.children![childIndex].insert(entry.item);
      }

      return true;
    }

    const data = entry.item.data;
    this.remove(id);
    this.insert({ id, bounds: newBounds, data });
    return true;
  }

  private split() {
    const { min, max } = this.bounds;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;

    this.children = [
      new QuadTree(
        { min: { x: min.x, y: min.y }, max: { x: midX, y: midY } },
        this.depth + 1,
        this.registry,
      ),
      new QuadTree(
        { min: { x: midX, y: min.y }, max: { x: max.x, y: midY } },
        this.depth + 1,
        this.registry,
      ),
      new QuadTree(
        { min: { x: min.x, y: midY }, max: { x: midX, y: max.y } },
        this.depth + 1,
        this.registry,
      ),
      new QuadTree(
        { min: { x: midX, y: midY }, max: { x: max.x, y: max.y } },
        this.depth + 1,
        this.registry,
      ),
    ];

    const remaining: QuadTreeItem<T>[] = [];
    for (const obj of this.objects) {
      const index = this.getChildIndexContaining(obj.bounds);
      if (index !== -1) {
        this.children[index].insert(obj);
      } else {
        remaining.push(obj);
        this.registry.set(obj.id, { node: this, item: obj });
      }
    }
    this.objects = remaining;
  }

  private getChildIndexContaining(bounds: Box | BoxAABB): number {
    if (!this.children) return -1;
    const normalized = QuadTree.normalizeBounds(bounds);
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
