import { BaseTile, TileType } from "../types/tiles";




export const TILE_CATALOG: Record<TileType, BaseTile[]> = {
    "WEAPON": [],
    "UTILITY": [
        {
            type: "UTILITY",
            tileSprite: "tiles/debug_heatsink",
            width: 1,
            height: 1,
        },
    ],
    "BLOCK": [
        {
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0001",
            width: 1,
            height: 1,
        },
        {
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0002",
            width: 1,
            height: 1,
        },
        {
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0003",
            width: 1,
            height: 1,
        },
        {
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0004",
            width: 1,
            height: 1,
        },
    ],
}