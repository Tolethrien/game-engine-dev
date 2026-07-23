interface GridCallbackProps {
  tilePixelPos: Position2D;
  tileGridPos: Position2D;
  index: number;
}
interface GridProps<T> {
  tileSize: Size2D;
  gridSize: Size2D;
  callback?: (props: GridCallbackProps) => T;
}
export default class Grid {
  static worldToTile(position: Position2D, tileSize: Size2D): Position2D {
    return {
      x: Math.floor(position.x / tileSize.width),
      y: Math.floor(position.y / tileSize.height),
    };
  }

  static tileToWorld(tile: Position2D, tileSize: Size2D): Position2D {
    return {
      x: tile.x * tileSize.width,
      y: tile.y * tileSize.height,
    };
  }

  static tileCenterToWorld(tile: Position2D, tileSize: Size2D): Position2D {
    return {
      x: tile.x * tileSize.width + tileSize.width / 2,
      y: tile.y * tileSize.height + tileSize.height / 2,
    };
  }

  static snapToGrid(position: Position2D, tileSize: Size2D): Position2D {
    const tile = Grid.worldToTile(position, tileSize);
    return Grid.tileToWorld(tile, tileSize);
  }

  static snapToGridCenter(position: Position2D, tileSize: Size2D): Position2D {
    const tile = Grid.worldToTile(position, tileSize);
    return Grid.tileCenterToWorld(tile, tileSize);
  }

  static tileToIndex(tile: Position2D, gridWidth: number) {
    return tile.y * gridWidth + tile.x;
  }

  static indexToTile(index: number, gridWidth: number): Position2D {
    return {
      x: index % gridWidth,
      y: Math.floor(index / gridWidth),
    };
  }
  static generateGrid<T = Position2D>({
    gridSize,
    tileSize,
    callback,
  }: GridProps<T>): T[] {
    const result: T[] = [];

    for (let y = 0; y < gridSize.height; y++) {
      for (let x = 0; x < gridSize.width; x++) {
        const tile = { x, y };
        const position = Grid.tileToWorld(tile, tileSize);
        const index = Grid.tileToIndex(tile, gridSize.width);
        result.push(
          callback
            ? callback({ tilePixelPos: position, tileGridPos: tile, index })
            : (position as T),
        );
      }
    }

    return result;
  }
}
