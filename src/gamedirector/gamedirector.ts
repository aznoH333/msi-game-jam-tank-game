import { getGameState } from "../game/gameState";
import { requestTransition } from "../game/screenTransition";
import { markShopCheckpoint, rewindToCheckpoint } from "./checkpoint";

/**
 * A stage in this context refers to the event number that has taken place.
 * 
 * Based on this number the game director decides what should be the next event
 */
export type EventType = "SHOP" | "TRAVEL" | "COMBAT" | "EXPLORATION";

const EVENT_LOOP: EventType[] = ["SHOP", "SHOP", "TRAVEL", "COMBAT", "TRAVEL", "EXPLORATION", "TRAVEL", "COMBAT", "TRAVEL"];



export interface GameDirector {
    eventIndex: number;
    /** When the player dies they are restored to this event */
    lastCheckPoint: number;
    currentEventType: EventType;
}


/** Inits empty game director ("new game") */
export function initGameDirector(): GameDirector {
    return {
        eventIndex: 0,
        lastCheckPoint: 0,
        currentEventType: "SHOP" 
    }
}




let attempt = 0;

/** Changes when a run starts or the player is sent back, so encounters rebuild. */
export function directorAttempt(): number {
    return attempt;
}

export function beginAttempt(): void {
    attempt += 1;
}

/** The shop the player is standing in becomes the place death sends them back to. */
export function rememberShopCheckpoint(): void {
    markShopCheckpoint(getGameState().gameDirector);
}

/** Death in a fight or a maze. Full heal, then the last shop. */
export function restoreCheckpoint(): void {
    requestTransition(() => {
        beginAttempt();
        const state = getGameState();
        rewindToCheckpoint(state.gameDirector, state.playerData, getEventTypeForIndex);
        state.currentScreen = screenForEvent(state.gameDirector.currentEventType);
    });
}

export function transitionToNextEvent() {
    requestTransition(() => {
        const state = getGameState();
        const director = state.gameDirector;
        director.eventIndex++;
        director.currentEventType = getEventTypeForIndex(director.eventIndex);
        state.currentScreen = screenForEvent(director.currentEventType);
    });
}

/** The travel stop offers this when the next event is an exploration. */
export function chooseExploration(choice: "explore" | "skip"): void {
    requestTransition(() => {
        const state = getGameState();
        const director = state.gameDirector;
        director.eventIndex += choice === "explore" ? 1 : 2;
        director.currentEventType = getEventTypeForIndex(director.eventIndex);
        state.currentScreen = screenForEvent(director.currentEventType);
    });
}

function screenForEvent(eventType: EventType): "BUILDING_SCREEN" | "COMBAT_SCREEN" | "EXPLORATION_SCREEN" {
    if (eventType === "SHOP") {
        return "BUILDING_SCREEN";
    }
    if (eventType === "EXPLORATION") {
        return "EXPLORATION_SCREEN";
    }
    return "COMBAT_SCREEN";
}

export function getEventTypeForIndex(eventIndex: number): EventType {
    return EVENT_LOOP[eventIndex % EVENT_LOOP.length];
}

/** The event that follows the current one. Does not advance the director. */
export function getNextEventType(): EventType {
    return getEventTypeForIndex(getGameState().gameDirector.eventIndex + 1);
}