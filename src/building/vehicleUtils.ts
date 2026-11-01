import { BaseVehicle } from "./types/vehicles";

export function getTotalPowerCapacity(vehicle: BaseVehicle): number {
    // count power capacity
    let output = 5; // base power capacity

    for (const tile of vehicle.tiles) {
        output += tile.base.powerCapacity ?? 0;
    }

    return output;
}


export function getPowerPerSecond(vehicle: BaseVehicle): number {
    let output = 1; // base power generation

    for (const tile of vehicle.tiles) {
        output += tile.base.powerGenerationPerSecond ?? 0;
    }

    return output;
}