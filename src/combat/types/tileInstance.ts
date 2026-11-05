import { PlacedTile } from "../../building/types/tiles";


export interface TileInstance {
    tile: PlacedTile;
    health: number;
    /** Seconds of hit flash still left. The tile is white at the start and normal at zero. */
    hitFlash: number;
}