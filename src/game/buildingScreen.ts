import { updateVehicleEditor } from "../building/vehicleEditor";
import { rememberShopCheckpoint } from "../gamedirector/gamedirector";
import { getGameState } from "./gameState";

export function buildingScreenUpdate() {
    rememberShopCheckpoint();
    updateVehicleEditor(getGameState());
}
