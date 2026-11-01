import { BaseVehicle } from "../building/types/vehicles";

export interface PlayerData {
    vehicle: BaseVehicle;
    money: number;
}

/** Initializes empty player data "new game" */
export function initPlayerData(): PlayerData {
    return {
        vehicle: {
            name: "Tank",
            tiles: []
        },
        money: 20_000,
    }
}