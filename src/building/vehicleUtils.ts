import type { BaseTurret, WeaponOverclockInstance } from "./types/tiles";
import { BaseVehicle } from "./types/vehicles";

export interface TurretCombatStats {
    damagePerShot: number;
    powerPerShot: number;
    salvoCount: number;
    salvoDelay: number;
    accuracy: number;
    reloadTime: number;
}

/** Base turret stats plus every allocated overclock point. */
export function getOverclockedTurretStats(
    turret: BaseTurret,
    overclocks: WeaponOverclockInstance[],
): TurretCombatStats {
    const stats: TurretCombatStats = {
        damagePerShot: turret.damagePerShot,
        powerPerShot: turret.powerPerShot,
        salvoCount: turret.salvoCount,
        salvoDelay: turret.salvoDelay,
        accuracy: turret.accuracy,
        reloadTime: turret.reloadTime,
    };

    for (const overclock of overclocks) {
        const points = overclock.value;
        const slider = overclock.base;
        if (slider.damage !== undefined) {
            stats.damagePerShot += points * slider.damage * turret.damagePerShot;
        }
        if (slider.powerCost !== undefined) {
            stats.powerPerShot += points * slider.powerCost * turret.powerPerShot;
        }
        if (slider.salvo !== undefined) {
            stats.salvoCount += points * slider.salvo;
        }
        if (slider.salvoDelay !== undefined) {
            stats.salvoDelay += points * slider.salvoDelay * turret.salvoDelay;
        }
        if (slider.accuracy !== undefined) {
            stats.accuracy += points * slider.accuracy * turret.accuracy;
        }
        if (slider.reloadTime !== undefined) {
            stats.reloadTime += points * slider.reloadTime * turret.reloadTime;
        }
    }

    return stats;
}

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