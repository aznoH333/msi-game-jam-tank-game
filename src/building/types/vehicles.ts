import { PlacedTile } from "./tiles";


/**
 * Represents a vehicle.
 * Holds general information about tile placement.
 * Doesn't hold the state of the tiles.
 */
export interface BaseVehicle {
    name: string;
    tiles: PlacedTile[];
}