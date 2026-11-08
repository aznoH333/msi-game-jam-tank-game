import { getGameState } from "../game/gameState";
import { requestTransition } from "../game/screenTransition";
import { markShopCheckpoint, rewindToCheckpoint } from "./checkpoint";
import { nextEvent, noteShopEntered, rollShopEvery } from "./schedule";

/**
 * A stage in this context refers to the event number that has taken place.
 *
 * Travel always sits between a shop and a fight. Fights come from the player's tier.
 */
export type EventType = "SHOP" | "TRAVEL" | "COMBAT" | "EXPLORATION";

export interface GameDirector {
    eventIndex: number;
    /** When the player dies they are restored to this event */
    lastCheckPoint: number;
    currentEventType: EventType;
    /** Enemy catalog tier the player is fighting through. */
    tier: number;
    /** Regular fights won in this tier. The next fight is the boss at 3. */
    combatsThisTier: number;
    /** Regular fights won since the player last stood in a shop. */
    fightsSinceShop: number;
    /** Shop after this many regular fights. 1 or 2. */
    shopEvery: number;
    /** The next stop after travel is the shop that follows a boss. */
    bossShopPending: boolean;
    /** The shop that sits in front of the final boss has already been visited. */
    finalBossShopDone: boolean;
    /** Regular enemy file from the previous fight. The next regular fight avoids it when it can. */
    lastEnemyFile: string | null;
}

/** Inits empty game director ("new game") */
export function initGameDirector(): GameDirector {
    return {
        eventIndex: 0,
        lastCheckPoint: 0,
        currentEventType: "SHOP",
        tier: 0,
        combatsThisTier: 0,
        fightsSinceShop: 0,
        shopEvery: rollShopEvery(),
        bossShopPending: false,
        finalBossShopDone: false,
        lastEnemyFile: null,
    };
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

/** Death in a fight or a maze. Full heal, then the last shop. Tier progress stays. */
export function restoreCheckpoint(): void {
    requestTransition(() => {
        beginAttempt();
        const state = getGameState();
        rewindToCheckpoint(state.gameDirector, state.playerData);
        state.currentScreen = screenForEvent(state.gameDirector.currentEventType);
    });
}

export function transitionToNextEvent() {
    requestTransition(() => {
        const state = getGameState();
        const director = state.gameDirector;
        const next = nextEvent(director);
        director.eventIndex += 1;
        director.currentEventType = next;
        if (next === "SHOP") {
            noteShopEntered(director);
        }
        state.currentScreen = screenForEvent(next);
    });
}

/** The travel stop offers this when the next event is an exploration. */
export function chooseExploration(choice: "explore" | "skip"): void {
    if (choice === "skip") {
        transitionToNextEvent();
        return;
    }
    requestTransition(() => {
        const state = getGameState();
        const director = state.gameDirector;
        director.eventIndex += 1;
        director.currentEventType = "EXPLORATION";
        state.currentScreen = "EXPLORATION_SCREEN";
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

/** The event that follows the current one. Does not advance the director. */
export function getNextEventType(): EventType {
    return nextEvent(getGameState().gameDirector);
}
