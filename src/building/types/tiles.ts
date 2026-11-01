export const TILE_SIZE_PX = 8; // the size of a single building grid cell in pixels

/**
 * Represents an unplaced game tile.
 * Holds basic general information about the tile.
 * 
 * Width and height are stored in tiles (1x1, 2x2 ect)
 * 
 */
export interface BaseTile{
    tileSprite: string;
    width: number;
    height: number;
}


/**
 * Prepresents a tile thats placed in a vehicle. 
 * Doesn't hold information about the tiles state.
 */
export interface PlacedTile {
    base: BaseTile;
    x: number; // x offset in tiles
    y: number; // y offset in tiles

}