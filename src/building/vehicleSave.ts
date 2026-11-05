import { TILE_CATALOG } from "./constants/tileCatalog";
import type { BaseTile, PlacedTile } from "./types/tiles";
import type { BaseVehicle } from "./types/vehicle";

export interface SavedOverclock {
    name: string;
    value: number;
}

export interface SavedTile {
    tileName: string;
    x: number;
    y: number;
    overclocks: SavedOverclock[];
}

export interface SavedVehicle {
    name: string;
    tiles: SavedTile[];
}

/** Compact vehicle file. Tile stats come from the catalog when this is loaded. */
export function serializeVehicle(vehicle: BaseVehicle): SavedVehicle {
    return {
        name: vehicle.name,
        tiles: vehicle.tiles.map((tile) => ({
            tileName: tile.base.tileName,
            x: tile.x,
            y: tile.y,
            overclocks: tile.overclocks.map((overclock) => ({
                name: overclock.base.name,
                value: overclock.value,
            })),
        })),
    };
}

/** Rebuild a vehicle from a saved name, position, and overclock values. */
export function vehicleFromSave(saved: SavedVehicle): BaseVehicle {
    return {
        name: saved.name,
        tiles: saved.tiles.map((savedTile) => placeSavedTile(savedTile)),
    };
}

function placeSavedTile(savedTile: SavedTile): PlacedTile {
    const catalogTile = catalogTileByName(savedTile.tileName);
    if (!catalogTile) {
        throw new Error(`Unknown tile ${savedTile.tileName}`);
    }
    const base = structuredClone(catalogTile);
    const savedValues = new Map((savedTile.overclocks ?? []).map((overclock) => [overclock.name, overclock.value]));
    return {
        base,
        x: savedTile.x,
        y: savedTile.y,
        overclocks: (base.turret?.overClocks ?? []).map((slider) => ({
            base: slider,
            value: savedValues.get(slider.name) ?? slider.baseValue,
        })),
    };
}

function catalogTileByName(tileName: string): BaseTile | undefined {
    for (const tiles of Object.values(TILE_CATALOG)) {
        const match = tiles.find((tile) => tile.tileName === tileName);
        if (match) {
            return match;
        }
    }
    return undefined;
}
