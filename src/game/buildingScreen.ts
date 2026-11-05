import { stopEngine } from "../audio/audio";
import { updateVehicleEditor } from "../building/vehicleEditor";
import { rememberShopCheckpoint } from "../gamedirector/gamedirector";
import { getGameState } from "./gameState";

export function buildingScreenUpdate() {
    stopEngine();
    rememberShopCheckpoint();
    updateVehicleEditor(getGameState());
}
