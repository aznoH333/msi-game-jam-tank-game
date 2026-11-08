import type { PlacedTile } from "./types/tiles";
import type { BaseVehicle } from "./types/vehicle";

export interface VehicleRuleFailure {
    explanation: string;
}

const NEEDS_GUN = "The vehicle needs a gun.";
const MUST_CONNECT = "All tiles must be connected. Disjointed islands are not allowed.";
const TOO_MANY_WEAPONS = "Not enough weapon slots.";
const TOO_TALL = "The vehicle can be at most twice as tall as it is wide.";

export function placedWeaponCount(vehicle: BaseVehicle): number {
    return vehicle.tiles.filter((tile) => tile.base.type === "WEAPON").length;
}

export function canAddWeapon(vehicle: BaseVehicle, slots: number): boolean {
    return placedWeaponCount(vehicle) < slots;
}

/** Rules that block leaving the shop, in display order. */
export function brokenVehicleRules(vehicle: BaseVehicle, weaponSlots = Number.POSITIVE_INFINITY): VehicleRuleFailure[] {
    const failures: VehicleRuleFailure[] = [];
    if (!vehicle.tiles.some((tile) => tile.base.turret !== undefined)) {
        failures.push({ explanation: NEEDS_GUN });
    }
    if (placedWeaponCount(vehicle) > weaponSlots) {
        failures.push({ explanation: TOO_MANY_WEAPONS });
    }
    if (!tilesAreConnected(vehicle.tiles)) {
        failures.push({ explanation: MUST_CONNECT });
    }
    if (isTallerThanTwiceItsWidth(vehicle.tiles)) {
        failures.push({ explanation: TOO_TALL });
    }
    return failures;
}

/** Edge contact joins a part to the vehicle. A shared corner does not. */
function tilesAreConnected(tiles: PlacedTile[]): boolean {
    if (tiles.length <= 1) {
        return true;
    }
    const seen = new Set<number>([0]);
    const pending = [0];
    while (pending.length > 0) {
        const current = pending.pop() ?? 0;
        for (let index = 0; index < tiles.length; index++) {
            if (seen.has(index) || !tilesTouch(tiles[current], tiles[index])) {
                continue;
            }
            seen.add(index);
            pending.push(index);
        }
    }
    return seen.size === tiles.length;
}

function tilesTouch(a: PlacedTile, b: PlacedTile): boolean {
    const overlapX = Math.min(a.x + a.base.width, b.x + b.base.width) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.base.height, b.y + b.base.height) - Math.max(a.y, b.y);
    return overlapX >= 0 && overlapY >= 0 && (overlapX > 0 || overlapY > 0);
}

/** Height is the span of occupied tiles. Exactly twice as tall is allowed. */
function isTallerThanTwiceItsWidth(tiles: PlacedTile[]): boolean {
    if (tiles.length === 0) {
        return false;
    }
    let minX = tiles[0].x;
    let minY = tiles[0].y;
    let maxX = minX + tiles[0].base.width;
    let maxY = minY + tiles[0].base.height;
    for (const tile of tiles) {
        minX = Math.min(minX, tile.x);
        minY = Math.min(minY, tile.y);
        maxX = Math.max(maxX, tile.x + tile.base.width);
        maxY = Math.max(maxY, tile.y + tile.base.height);
    }
    return maxY - minY > (maxX - minX) * 2;
}
