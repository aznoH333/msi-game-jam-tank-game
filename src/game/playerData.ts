import { BaseVehicle } from "../building/types/vehicles";

export interface PlayerData {
    vehicle: BaseVehicle;
}

/** Initializes empty player data "new game" */
export function initPlayerData(): PlayerData {
    return {
        vehicle: {
            tiles: []
        }
    }
}