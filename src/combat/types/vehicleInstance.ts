import { BaseVehicle } from "../../building/types/vehicle";
import { TileInstance } from "./tileInstance";

export interface VehicleInstance {
    base: BaseVehicle;
    tiles: TileInstance[];
    power: number;
}