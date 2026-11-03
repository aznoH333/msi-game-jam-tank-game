import { PERSON_HEALTH_MAX, type PlayerData } from "../game/playerData";
import type { EventType, GameDirector } from "./gamedirector";

/** The shop the player is standing in becomes the place death sends them back to. */
export function markShopCheckpoint(director: GameDirector): void {
    if (director.currentEventType === "SHOP") {
        director.lastCheckPoint = director.eventIndex;
    }
}

/** Death in a fight or a maze. Full heal, then the last shop. */
export function rewindToCheckpoint(
    director: GameDirector,
    player: PlayerData,
    eventTypeAt: (eventIndex: number) => EventType,
): void {
    director.eventIndex = director.lastCheckPoint;
    director.currentEventType = eventTypeAt(director.eventIndex);
    player.personHealth = PERSON_HEALTH_MAX;
}
