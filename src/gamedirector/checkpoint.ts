import { PERSON_HEALTH_MAX, type PlayerData } from "../game/playerData";
import type { GameDirector } from "./gamedirector";

/** The shop the player is standing in becomes the place death sends them back to. */
export function markShopCheckpoint(director: GameDirector): void {
    if (director.currentEventType === "SHOP") {
        director.lastCheckPoint = director.eventIndex;
    }
}

/** Death in a fight or a maze. Full heal, then the last shop. Tier progress stays. */
export function rewindToCheckpoint(director: GameDirector, player: PlayerData): void {
    director.eventIndex = director.lastCheckPoint;
    director.currentEventType = "SHOP";
    player.personHealth = PERSON_HEALTH_MAX;
}
