import type { BaseTurret, PlacedTile, WeaponOverclockInstance } from "./types/tiles";
import { BaseVehicle } from "./types/vehicle";

export interface TurretCombatStats {
    damagePerShot: number;
    powerPerShot: number;
    salvoCount: number;
    salvoDelay: number;
    accuracy: number;
    reloadTime: number;
    projectileSpeed: number;
    explosionRadius: number;
    /** Chance a shot jams. Starts at 0. */
    jamChance: number;
    /** Chance a shot fails. Starts at 0. */
    failChance: number;
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
        projectileSpeed: turret.projectileSpeed,
        explosionRadius: turret.explosionRadius,
        jamChance: 0,
        failChance: 0,
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
        if (slider.explosionRadius !== undefined) {
            stats.explosionRadius += points * slider.explosionRadius * turret.explosionRadius;
        }
        if (slider.jamChance !== undefined) {
            stats.jamChance += points * slider.jamChance;
        }
        if (slider.failChance !== undefined) {
            stats.failChance += points * slider.failChance;
        }
    }

    return stats;
}

export function getTotalPowerCapacity(vehicle: BaseVehicle): number {
    // count power capacity
    let output = 0; // base power capacity

    for (const tile of vehicle.tiles) {
        output += tile.base.powerCapacity ?? 0;
    }

    return output;
}


export function getPowerPerSecond(vehicle: BaseVehicle): number {
    let output = 0; // base power generation

    for (const tile of vehicle.tiles) {
        output += tile.base.powerGenerationPerSecond ?? 0;
    }

    return output;
}

/** Modules installed on this slider. Each step above stock costs `stepCost` modules. */
export function overclockModulesUsed(instance: WeaponOverclockInstance): number {
    const step = instance.base.stepSize;
    if (step === 0) {
        return 0;
    }
    const steps = Math.max(0, Math.round((instance.value - instance.base.baseValue) / step));
    return steps * Math.max(0, instance.base.stepCost);
}

/** Modules to give back when this part is sold. */
export function modulesInTile(tile: PlacedTile): number {
    return tile.overclocks.reduce((sum, overclock) => sum + overclockModulesUsed(overclock), 0);
}

/**
 * Move one step. A step that adds modules costs `stepCost`. A step that removes them refunds that many.
 * Tuning at or below the stock value does not pay modules out.
 */
export function adjustOverclock(
    instance: WeaponOverclockInstance,
    direction: 1 | -1,
    modules: number,
): { value: number; modules: number } | null {
    const slider = instance.base;
    if (slider.stepSize === 0) {
        return null;
    }
    const next = Number((instance.value + direction * slider.stepSize).toFixed(4));
    if (next > slider.maxValue || next < slider.minValue) {
        return null;
    }
    const cost = overclockModulesUsed({ base: slider, value: next }) - overclockModulesUsed(instance);
    if (cost > modules) {
        return null;
    }
    return { value: next, modules: modules - cost };
}