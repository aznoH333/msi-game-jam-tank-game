export const LOOT_MONEY = 500;
export const LOOT_FADE_SECONDS = 0.5;
export const LOOT_POPUP_SECONDS = 1.2;
/** Each blink frame, idle and lit, holds for this long. */
export const LOOT_BLINK_SECONDS = 0.5;

const LOOT_SPACING = 18;
const LOOT_KINDS = ["trash_1", "trash_2", "crate"] as const;

export type LootKind = (typeof LOOT_KINDS)[number];

export type LootReward =
    | { kind: "money"; amount: number }
    | { kind: "module"; amount: number };

export interface StreetLoot {
    index: number;
    x: number;
    z: number;
    kind: LootKind;
    reward: LootReward;
}

const LOOT_FRAMES: Record<LootKind, readonly [string, string]> = {
    trash_1: ["world/loot/trash_1", "world/loot/trash_1_blink"],
    trash_2: ["world/loot/trash_2", "world/loot/trash_2_blink"],
    crate: ["world/loot/crate", "world/loot/crate_blink"],
};

/** Containers parked on one trip. The same event index always lays down the same ones. */
export function streetLoot(eventIndex: number, laneHalf: number, endZ: number): StreetLoot[] {
    const loot: StreetLoot[] = [];
    const last = Math.floor(endZ / LOOT_SPACING);
    for (let index = 1; index <= last; index++) {
        const seed = mixHash(index * 29 + eventIndex * 11 + 5);
        if (seed % 3 === 0) {
            continue;
        }
        const along = (mixHash(seed ^ 0x9e3779b1) % 1000) / 1000;
        const z = index * LOOT_SPACING + along * LOOT_SPACING * 0.45;
        if (z > endZ) {
            continue;
        }
        const across = ((seed >>> 8) % 1000) / 999;
        const kind = LOOT_KINDS[mixHash(seed ^ 0x85ebca6b) % LOOT_KINDS.length];
        const module = (seed >>> 16) % 2 === 0;
        loot.push({
            index,
            x: (across * 2 - 1) * laneHalf,
            z,
            kind,
            reward: module ? { kind: "module", amount: 1 } : { kind: "money", amount: LOOT_MONEY },
        });
    }
    return loot;
}

/** Idle frame, then the blink frame, each held for half a second. */
export function lootSprite(kind: LootKind, time: number, index: number): string {
    const frames = LOOT_FRAMES[kind];
    const blinking = Math.floor((time + index * 0.17) / LOOT_BLINK_SECONDS) % 2 === 1;
    return frames[blinking ? 1 : 0];
}

export function lootIcon(reward: LootReward): string {
    return reward.kind === "money" ? "world/loot/money" : "world/loot/overclock";
}

export function lootLabel(reward: LootReward): string {
    return reward.kind === "money" ? `+${reward.amount}` : "Module";
}

function mixHash(n: number): number {
    let h = Math.imul(n | 0, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA77);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
}
