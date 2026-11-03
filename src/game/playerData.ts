import { BaseVehicle } from "../building/types/vehicle";

export interface PlayerData {
    vehicle: BaseVehicle;
    money: number;
    overclockModules: number;
}

/** Initializes empty player data "new game" */
export function initPlayerData(): PlayerData {
    return {
        vehicle: {
            name: "Tank",
            tiles: []
        },
        money: 20_000,
        overclockModules: 3,
    }
}