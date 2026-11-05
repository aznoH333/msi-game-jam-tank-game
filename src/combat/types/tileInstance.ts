import { PlacedTile } from "../../building/types/tiles";

export type GunFault = "jam" | "fail";

export interface TileInstance {
    tile: PlacedTile;
    health: number;
    /** Seconds of hit flash still left. The tile is white at the start and normal at zero. */
    hitFlash: number;
    /** Seconds of heal flash still left. The tile is green at the start and normal at zero. */
    healFlash: number;
    /** Jam or fail icon on this gun. Null when it is not showing. */
    fault: GunFault | null;
    /** Seconds since the jam or fail. */
    faultAge: number;
}