import { BaseTile, TileType } from "../types/tiles";

export const TILE_CATALOG: Record<TileType, BaseTile[]> = {
    "WEAPON": [
        {
            tileName: "Debug gun",
            type: "WEAPON",
            tileSprite: "tiles/debug_turret_base",
            turretSprite: "tiles/debug_turret",
            width: 2,
            height: 2,
        },
    ],
    "UTILITY": [
        {
            tileName: "Heat sink",
            type: "UTILITY",
            tileSprite: "tiles/debug_heatsink",
            width: 1,
            height: 1,
        },
        {
            tileName: "Small battery",
            type: "UTILITY",
            tileSprite: "tiles/debug_battery_small",
            width: 1,
            height: 1,
            powerCapacity: 50,
        },
        {
            tileName: "Small generator",
            type: "UTILITY",
            tileSprite: "tiles/debug_generator_small",
            width: 1,
            height: 1,
            powerGenerationPerSecond: 5,
        },
        {
            tileName: "Big battery",
            type: "UTILITY",
            tileSprite: "tiles/debug_battery_big",
            width: 2,
            height: 2,
            powerCapacity: 250,
        },
        {
            tileName: "Big generator",
            type: "UTILITY",
            tileSprite: "tiles/debug_generator_big",
            width: 2,
            height: 2,
            powerGenerationPerSecond: 25,
        }
    ],
    "BLOCK": [
        {
            tileName: "Block 1",
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0001",
            width: 1,
            height: 1,
        },
        {
            tileName: "Block 2",
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0002",
            width: 1,
            height: 1,
        },
        {
            tileName: "Block 3",
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0003",
            width: 1,
            height: 1,
        },
        {
            tileName: "Block 4",
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0004",
            width: 1,
            height: 1,
        },
        {
            tileName: "Big tile",
            type: "BLOCK",
            tileSprite: "tiles/debug_tile_big",
            width: 2,
            height: 2,
        },
    ],
};
