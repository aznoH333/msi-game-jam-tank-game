import { getGameState, switchGameState } from "../game/gameState";

/**
 * A stage in this context refers to the event number that has taken place.
 * 
 * Based on this number the game director decides what should be the next event
 */
export type EventType = "SHOP" | "TRAVEL" | "COMBAT";

const EVENT_LOOP: EventType[] = ["SHOP", "TRAVEL", "COMBAT", "TRAVEL", "COMBAT", "TRAVEL"];



export interface GameDirector {
    eventIndex: number;
    currentEventType: EventType;
}


/** Inits empty game director ("new game") */
export function initGameDirector(): GameDirector {
    return {
        eventIndex: 0,
        currentEventType: "SHOP" 
    }
}




/** The player lost a fight. Put them back at the shop that started this loop. */
export function loseCombat(): void {
    const director = getGameState().gameDirector;
    director.eventIndex = Math.floor(director.eventIndex / EVENT_LOOP.length) * EVENT_LOOP.length;
    director.currentEventType = "SHOP";
    switchGameState("BUILDING_SCREEN");
}

export function transitionToNextEvent() {
    const director = getGameState().gameDirector;

    director.eventIndex++;
    const nextEventType = getEventTypeForIndex(director.eventIndex);
    director.currentEventType = nextEventType;

    // switch scene to match
    if (nextEventType == "SHOP") {
        switchGameState("BUILDING_SCREEN");
    } else {
        switchGameState("COMBAT_SCREEN");
    }
}

export function getEventTypeForIndex(eventIndex: number): EventType {
    return EVENT_LOOP[eventIndex % EVENT_LOOP.length];
}

/** The event that follows the current one. Does not advance the director. */
export function getNextEventType(): EventType {
    return getEventTypeForIndex(getGameState().gameDirector.eventIndex + 1);
}