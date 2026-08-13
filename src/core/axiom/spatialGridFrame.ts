const CELL_KEY_OFFSET = 1 << 15;
type SpatialGridItem<T> = {
  id: Symbol;
  bounds: Box | BoxAABB;
  data: T;
};
export default class FrameSpatialGrid<T> {
  private cellSize: Size2D;
  private cells: Map<number, SpatialGridItem<T>[]> = new Map();

  constructor(cellSize: Size2D) {
    this.cellSize = cellSize;
  }

  clear() {
    this.cells.clear();
  }

  insert(item: SpatialGridItem<T>) {
    const { minCellX, minCellY, maxCellX, maxCellY } =
      FrameSpatialGrid.getCellRange(item.bounds, this.cellSize);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = FrameSpatialGrid.cellKey(cx, cy);
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(item);
      }
    }
  }

  query(range: Box | BoxAABB): T[] {
    const { minCellX, minCellY, maxCellX, maxCellY } =
      FrameSpatialGrid.getCellRange(range, this.cellSize);
    const seen = new Set<Symbol>();
    const result: T[] = [];

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = this.cells.get(FrameSpatialGrid.cellKey(cx, cy));
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
