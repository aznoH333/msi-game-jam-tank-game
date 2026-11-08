import type { EventType, GameDirector } from "./gamedirector";

/** Regular fights in a tier before that tier's boss. */
export const FIGHTS_BEFORE_BOSS = 3;
const SHOP_EVERY_MIN = 1;
const SHOP_EVERY_MAX = 2;

/** 1 or 2 regular fights between shops, so a tier always shops before its boss. */
export function rollShopEvery(): number {
    const span = SHOP_EVERY_MAX - SHOP_EVERY_MIN + 1;
    return SHOP_EVERY_MIN + Math.floor(Math.random() * span);
}

/**
 * Travel sits between every shop and fight.
 * A due shop waits while the tier boss is the next enemy, except the final boss, which waits for one shop.
 * Beating a boss forces the shop that follows it.
 */
export function nextEvent(director: GameDirector): EventType {
    if (director.currentEventType !== "TRAVEL") {
        return "TRAVEL";
    }
    if (director.bossShopPending) {
        return "SHOP";
    }
    if (director.combatsThisTier >= FIGHTS_BEFORE_BOSS) {
        if (needsFinalBossShop(director)) {
            return "SHOP";
        }
        return "COMBAT";
    }
    if (director.fightsSinceShop >= director.shopEvery) {
        return "SHOP";
    }
    return "COMBAT";
}

/** The final boss waits until the player has stood in the shop in front of it. */
function needsFinalBossShop(director: GameDirector): boolean {
    return director.tier === JOURNEY_TIER_COUNT && !director.finalBossShopDone;
}

/** The next fight is the tier boss once three regulars are down, or immediately when the tier has none. */
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

/** The shop after the tier 0 boss. No tier 1 fight has been won yet. */
export function isPostTutorialBossShop(director: GameDirector): boolean {
    return director.currentEventType === "SHOP" && director.tier === 1 && director.combatsThisTier === 0;
}

/** Tiers drawn on the travel bar. Tier 0 is the tutorial and stays off the bar. */
export const JOURNEY_TIER_COUNT = 4;

/** The travel bar appears once the tutorial boss is dead. */
export function journeyVisible(tier: number): boolean {
    return tier >= 1;
}

/**
 * 0 is the start of tier 1. 1 is the final boss.
 * `driveTowardCombat` is how far the current drive is, and only when that drive ends in a fight.
 */
export function journeyFraction(tier: number, combatsThisTier: number, driveTowardCombat: number): number {
    if (tier > JOURNEY_TIER_COUNT) {
        return 1;
    }
    const tierIndex = Math.max(0, tier - 1);
    const steps = FIGHTS_BEFORE_BOSS + 1;
    const drive = Math.min(1, Math.max(0, driveTowardCombat));
    const step = Math.min(steps, Math.max(0, combatsThisTier) + drive);
    return Math.min(1, (tierIndex + step / steps) / JOURNEY_TIER_COUNT);
}

/** Where each tier's boss sits. The last tier is the end flag, so it is not in this list. */
export function journeyBossMarks(): number[] {
    const marks: number[] = [];
    for (let tier = 1; tier < JOURNEY_TIER_COUNT; tier++) {
        marks.push(tier / JOURNEY_TIER_COUNT);
    }
    return marks;
}

/** Arriving at a shop starts a fresh 1–2 fight gap. */
export function noteShopEntered(director: GameDirector, shopEvery = rollShopEvery()): void {
    if (director.tier === JOURNEY_TIER_COUNT && director.combatsThisTier >= FIGHTS_BEFORE_BOSS) {
        director.finalBossShopDone = true;
    }
    director.fightsSinceShop = 0;
    director.bossShopPending = false;
    director.shopEvery = shopEvery;
}
