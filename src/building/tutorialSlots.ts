import type { PlacedTile } from "./types/tiles";
import type { BaseVehicle } from "./types/vehicle";

export interface TutorialSlot {
    tileName: string;
    x: number;
    y: number;
    width: number;
    height: number;
    kind: "gun" | "generator" | "battery";
}

let slots: TutorialSlot[] = [];

/** The parts lifted off the starter tank, in the cells they came from. */
export function tutorialSlots(): readonly TutorialSlot[] {
    return slots;
}

/** Load the authored tank, then take off its gun, generator, and battery. */
export function vehicleWithoutTutorialParts(vehicle: BaseVehicle): BaseVehicle {
    const removed: TutorialSlot[] = [];
    const kept: PlacedTile[] = [];
    for (const tile of vehicle.tiles) {
        const kind = partKind(tile);
        if (!kind) {
            kept.push(tile);
            continue;
        }
        removed.push({
            tileName: tile.base.tileName,
            x: tile.x,
            y: tile.y,
            width: tile.base.width,
            height: tile.base.height,
            kind,
        });
    }
    slots = removed;
    return { name: vehicle.name, tiles: kept };
}

function partKind(tile: PlacedTile): TutorialSlot["kind"] | null {
    if (tile.base.type === "WEAPON") {
        return "gun";
    }
    if ((tile.base.powerGenerationPerSecond ?? 0) > 0) {
        return "generator";
    }
    if ((tile.base.powerCapacity ?? 0) > 0) {
        return "battery";
    }
    return null;
}
