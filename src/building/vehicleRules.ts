import type { PlacedTile } from "./types/tiles";
import type { BaseVehicle } from "./types/vehicle";

export interface VehicleRuleFailure {
    explanation: string;
}

const NEEDS_GUN = "The vehicle needs a gun.";
const MUST_CONNECT = "All tiles must be connected. Disjointed islands are not allowed.";

/** Rules that block leaving the shop, in display order. */
export function brokenVehicleRules(vehicle: BaseVehicle): VehicleRuleFailure[] {
    const failures: VehicleRuleFailure[] = [];
    if (!vehicle.tiles.some((tile) => tile.base.turret !== undefined)) {
        failures.push({ explanation: NEEDS_GUN });
    }
    if (!tilesAreConnected(vehicle.tiles)) {
        failures.push({ explanation: MUST_CONNECT });
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
