import { getGameState, switchGameState } from "../game/gameState";

/**
 * A stage in this context refers to the event number that has taken place.
 * 
 * Based on this number the game director decides what should be the next event
 */
export type EventType = "SHOP" | "COMBAT";



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




export function transitionToNextEvent() {
    const director = getGameState().gameDirector;

    director.eventIndex++;


    // get next event
    let nextEventType: EventType;

    if (director.eventIndex % 4 == 0) { // this is placeholder logic. Right now its just an infinite loop or shop->combat->combat->combat->repeat
        nextEventType = "SHOP";
    } else {
        nextEventType = "COMBAT";
    }


    director.currentEventType = nextEventType;

    // switch scene to match
    if (nextEventType == "SHOP") {
        switchGameState("BUILDING_SCREEN");
    } else {
        switchGameState("COMBAT_SCREEN");
    }
}