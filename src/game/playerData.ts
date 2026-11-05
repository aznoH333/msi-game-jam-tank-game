import starterVehicle from "../../assets/playerVehicles/1.json";
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
}

/** Initializes empty player data "new game" */
export function initPlayerData(): PlayerData {
    return {
        vehicle: vehicleFromSave(starterVehicle),
        money: 20_000,
        overclockModules: 3,
        weapons: {
            "fists": 0, 
            "pistol": 50,
        },
        personHealth: PERSON_HEALTH_MAX,
        vehicleWeaponSlots: 1,
    }
}