import type { EventType, GameDirector } from "./gamedirector";

/** Regular fights in a tier before that tier's boss. */
export const FIGHTS_BEFORE_BOSS = 5;
const SHOP_EVERY_MIN = 2;
const SHOP_EVERY_MAX = 3;

/** 2 or 3 regular fights between shops. */
export function rollShopEvery(): number {
    const span = SHOP_EVERY_MAX - SHOP_EVERY_MIN + 1;
    return SHOP_EVERY_MIN + Math.floor(Math.random() * span);
}

/**
 * Travel sits between every shop and fight.
 * A due shop waits while the tier boss is the next enemy. Beating the boss forces the following shop.
 */
export function nextEvent(director: GameDirector): EventType {
    if (director.currentEventType !== "TRAVEL") {
        return "TRAVEL";
    }
    if (director.bossShopPending) {
        return "SHOP";
    }
    if (director.combatsThisTier >= FIGHTS_BEFORE_BOSS) {
        return "COMBAT";
    }
    if (director.fightsSinceShop >= director.shopEvery) {
        return "SHOP";
    }
    return "COMBAT";
}

/** The next fight is the tier boss once five regulars are down, or immediately when the tier has none. */
export function combatIsBoss(director: GameDirector, tierHasRegulars: boolean): boolean {
    return !tierHasRegulars || director.combatsThisTier >= FIGHTS_BEFORE_BOSS;
}

/** A won fight. Bosses raise the tier and queue the shop that follows them. */
export function recordCombatVictory(director: GameDirector, boss: boolean): void {
    if (boss) {
        director.tier += 1;
        director.combatsThisTier = 0;
        director.fightsSinceShop = 0;
        director.bossShopPending = true;
        return;
    }
    director.combatsThisTier += 1;
    director.fightsSinceShop += 1;
}

/** Arriving at a shop starts a fresh 2–3 fight gap. */
export function noteShopEntered(director: GameDirector, shopEvery = rollShopEvery()): void {
    director.fightsSinceShop = 0;
    director.bossShopPending = false;
    director.shopEvery = shopEvery;
}
