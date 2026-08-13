const CELL_KEY_OFFSET = 1 << 15;
type SpatialGridEntry<T> = { cellKeys: number[]; item: SpatialGridItem<T> };
type SpatialGridItem<T> = {
  id: Symbol;
  bounds: Box | BoxAABB;
  data: T;
};
export default class SpatialGrid<T> {
  private cellSize: Size2D;
  private cells: Map<number, SpatialGridItem<T>[]> = new Map();
  private registry: Map<Symbol, SpatialGridEntry<T>> = new Map();

  constructor(cellSize: Size2D) {
    this.cellSize = cellSize;
  }

  private computeCellKeys(shape: Box | BoxAABB): number[] {
    const { minCellX, minCellY, maxCellX, maxCellY } = SpatialGrid.getCellRange(
      shape,
      this.cellSize,
    );
    const keys: number[] = [];
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        keys.push(SpatialGrid.cellKey(cx, cy));
      }
    }
    return keys;
  }

  private addToCell(key: number, item: SpatialGridItem<T>) {
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    cell.push(item);
  }

  private removeFromCell(key: number, item: SpatialGridItem<T>) {
    const cell = this.cells.get(key);
    if (!cell) return;
    const index = cell.indexOf(item);
    if (index !== -1) cell.splice(index, 1);
    if (cell.length === 0) this.cells.delete(key);
  }

  insert(item: SpatialGridItem<T>) {
    const cellKeys = this.computeCellKeys(item.bounds);
    for (const key of cellKeys) this.addToCell(key, item);
    this.registry.set(item.id, { cellKeys, item });
  }

  remove(id: Symbol) {
    const entry = this.registry.get(id);
    if (!entry) return false;
    for (const key of entry.cellKeys) this.removeFromCell(key, entry.item);
    this.registry.delete(id);
    return true;
  }

  move(id: Symbol, newBounds: Box | BoxAABB) {
    const entry = this.registry.get(id);
    if (!entry) return false;

    const newKeys = this.computeCellKeys(newBounds);
    const oldKeysSet = new Set(entry.cellKeys);
    const newKeysSet = new Set(newKeys);

    for (const key of entry.cellKeys) {
      if (!newKeysSet.has(key)) this.removeFromCell(key, entry.item);
    }
    for (const key of newKeys) {
      if (!oldKeysSet.has(key)) this.addToCell(key, entry.item);
    }

    entry.item.bounds = newBounds;
    entry.cellKeys = newKeys;
    return true;
  }

  query(range: Box | BoxAABB): T[] {
    const { minCellX, minCellY, maxCellX, maxCellY } = SpatialGrid.getCellRange(
      range,
      this.cellSize,
    );
    const seen = new Set<Symbol>();
    const result: T[] = [];

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = this.cells.get(SpatialGrid.cellKey(cx, cy));
        if (!cell) continue;
        for (const item of cell) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          result.push(item.data);
        }
      }
    }

    return result;
  }
  private static cellKey(x: number, y: number) {
    return (
      (((x + CELL_KEY_OFFSET) & 0xffff) << 16) |
      ((y + CELL_KEY_OFFSET) & 0xffff)
    );
  }

  private static getCellRange(shape: Box | BoxAABB, cellSize: Size2D) {
    const bounds =
      "min" in shape
        ? {
            minX: shape.min.x,
            minY: shape.min.y,
            maxX: shape.max.x,
            maxY: shape.max.y,
          }
        : {
            minX: shape.x,
            minY: shape.y,
            maxX: shape.x + shape.w,
            maxY: shape.y + shape.h,
          };

    return {
      minCellX: Math.floor(bounds.minX / cellSize.width),
      minCellY: Math.floor(bounds.minY / cellSize.height),
      maxCellX: Math.floor(bounds.maxX / cellSize.width),
      maxCellY: Math.floor(bounds.maxY / cellSize.height),
    };
  }
  forEachCell(cb: (cx: number, cy: number, count: number) => void) {
    for (const [key, cell] of this.cells) {
      const cx = ((key >>> 16) & 0xffff) - CELL_KEY_OFFSET;
      const cy = (key & 0xffff) - CELL_KEY_OFFSET;
      cb(cx, cy, cell.length);
    }
  }
}
