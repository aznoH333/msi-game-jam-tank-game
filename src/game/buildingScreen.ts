import { installVehicleEditorInput, updateVehicleEditor } from "../building/vehicleEditor";
import { getGameState } from "./gameState";

installVehicleEditorInput(getGameState);

export function buildingScreenUpdate() {
    updateVehicleEditor(getGameState());
}
