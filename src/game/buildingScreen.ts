import { updateVehicleEditor } from "../building/vehicleEditor";
import { getGameState } from "./gameState";

export function buildingScreenUpdate() {
    updateVehicleEditor(getGameState());
}
