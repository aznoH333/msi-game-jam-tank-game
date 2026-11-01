export const TILE_SIZE_PX = 8; // the size of a single building grid cell in pixels

export type TileType = "WEAPON" | "UTILITY" | "BLOCK";







/**
 * Represents an unplaced game tile.
 * Holds basic general information about the tile.
 * 
 * Width and height are stored in tiles (1x1, 2x2 ect)
 * 
 */
export interface BaseTile{
    /** the name of the tile */
    tileName: string;
    
    type: TileType;
    tileSprite: string;
    width: number;
    height: number;
    
    powerCapacity?: number;
    powerGenerationPerSecond?: number;

    /** This is used as the turret sprite. If undefined the tile has no turret */
    turretSprite?: string;
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