import { updateCombat } from "../combat/combat";
import { updateTravel } from "../combat/travel";
import { getGameState } from "./gameState";

export function combatScreenUpdate() {
    if (getGameState().gameDirector.currentEventType === "TRAVEL") {
        updateTravel();
        return;
    }
    updateCombat();
}
