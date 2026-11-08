import starterVehicle from "../../assets/playerVehicles/1.json";
import { vehicleWithoutTutorialParts } from "../building/tutorialSlots";
import { vehicleFromSave } from "../building/vehicleSave";
import { BaseVehicle } from "../building/types/vehicle";
import { WeaponName } from "../exploration/constants/weaponCatalog";

export const PERSON_HEALTH_MAX = 100;

export interface PlayerData {
    vehicle: BaseVehicle;
    money: number;
    overclockModules: number;
    /** Unlocked weapon -> ammo. A missing weapon is locked. */
    weapons: Partial<Record<WeaponName, number>>;
    personHealth: number;
    vehicleWeaponSlots: number;
    unlockedTiles: string[];
}

/** Initializes empty player data "new game" */
export function initPlayerData(): PlayerData {
    return {
        vehicle: vehicleWithoutTutorialParts(vehicleFromSave(starterVehicle)),
        money: 5_100,
        overclockModules: 0,
        weapons: {
            "fists": 0, 
            "pistol": 50,
        },
        personHealth: PERSON_HEALTH_MAX,
        vehicleWeaponSlots: 3,
        unlockedTiles: ["Machine gun", "Metal frame", "Small generator", "Small battery"]
    }
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