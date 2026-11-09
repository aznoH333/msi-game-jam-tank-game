import starterVehicle from "../../assets/playerVehicles/1.json";
import { vehicleWithoutTutorialParts } from "../building/tutorialSlots";
import { vehicleFromSave } from "../building/vehicleSave";
import { BaseVehicle } from "../building/types/vehicle";
import { WeaponName } from "../exploration/constants/weaponCatalog";

export const PERSON_HEALTH_MAX = 100;

export type Difficulty = "normal" | "hard";

/** Weapon slots on Hard. Normal adds one. */
const HARD_WEAPON_SLOTS = 3;
/** Extra share of a defeated enemy's bounty on Normal. */
const NORMAL_BOUNTY_BONUS = 0.2;

export interface PlayerData {
    vehicle: BaseVehicle;
    money: number;
    overclockModules: number;
    /** Unlocked weapon -> ammo. A missing weapon is locked. */
    weapons: Partial<Record<WeaponName, number>>;
    personHealth: number;
    vehicleWeaponSlots: number;
    difficulty: Difficulty;
    unlockedTiles: string[];
}

/** Initializes empty player data "new game". Hard is the current rules. */
export function initPlayerData(difficulty: Difficulty = "hard"): PlayerData {
    return {
        vehicle: vehicleWithoutTutorialParts(vehicleFromSave(starterVehicle)),
        money: 5_100,
        overclockModules: 0,
        weapons: {
            "fists": 0, 
            "pistol": 50,
        },
        personHealth: PERSON_HEALTH_MAX,
        vehicleWeaponSlots: difficulty === "normal" ? HARD_WEAPON_SLOTS + 1 : HARD_WEAPON_SLOTS,
        difficulty,
        unlockedTiles: ["Machine gun", "Metal frame", "Small generator", "Small battery"]
    }
}

/** Money paid for defeating an enemy. Normal adds 20%. */
export function enemyBounty(base: number, difficulty: Difficulty): number {
    if (difficulty !== "normal") {
        return base;
    }
    return Math.round(base * (1 + NORMAL_BOUNTY_BONUS));
}

/** Remember every part that was built into a tank the player just destroyed. */
export function unlockVehicleTiles(player: PlayerData, vehicle: BaseVehicle): void {
    for (const tile of vehicle.tiles) {
        const name = tile.base.tileName;
        if (!player.unlockedTiles.includes(name)) {
            player.unlockedTiles.push(name);
        }
    }
}