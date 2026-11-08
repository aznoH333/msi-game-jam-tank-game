import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markShopCheckpoint, rewindToCheckpoint } from "../src/gamedirector/checkpoint";
import type { GameDirector } from "../src/gamedirector/gamedirector";
import { chooseEnemyRecord } from "../src/gamedirector/enemyPick";
import { combatIsBoss, isPostTutorialBossShop, journeyBossMarks, journeyFraction, journeyVisible, nextEvent, noteShopEntered, recordCombatVictory } from "../src/gamedirector/schedule";
import { PERSON_HEALTH_MAX, initPlayerData } from "../src/game/playerData";

function director(eventIndex: number, currentEventType: GameDirector["currentEventType"], lastCheckPoint = 0): GameDirector {
    return {
        eventIndex,
        lastCheckPoint,
        currentEventType,
        tier: 1,
        combatsThisTier: 0,
        fightsSinceShop: 0,
        shopEvery: 2,
        bossShopPending: false,
        finalBossShopDone: false,
        lastEnemyFile: null,
    };
}

describe("checkpoints", () => {
    it("remembers a shop and ignores other events", () => {
        const shop = director(8, "SHOP");
        markShopCheckpoint(shop);
        assert.equal(shop.lastCheckPoint, 8);

        const fight = director(10, "COMBAT", 8);
        markShopCheckpoint(fight);
        assert.equal(fight.lastCheckPoint, 8);
    });

    it("sends a dead player back to that shop at full health", () => {
        const run = director(12, "COMBAT", 8);
        const player = initPlayerData();
        player.personHealth = 0;
        player.money = 1234;
        run.tier = 3;
        run.combatsThisTier = 4;
        rewindToCheckpoint(run, player);
        assert.equal(run.eventIndex, 8);
        assert.equal(run.currentEventType, "SHOP");
        assert.equal(run.tier, 3);
        assert.equal(run.combatsThisTier, 4);
        assert.equal(player.personHealth, PERSON_HEALTH_MAX);
        assert.equal(player.money, 1234);
    });
});

describe("tier schedule", () => {
    it("travels between stops, shops after two fights, then a boss, then a shop", () => {
        const run = director(0, "SHOP");
        assert.equal(nextEvent(run), "TRAVEL");
        run.currentEventType = "TRAVEL";
        assert.equal(nextEvent(run), "COMBAT");
        assert.equal(combatIsBoss(run, true), false);

        recordCombatVictory(run, false);
        run.currentEventType = "COMBAT";
        assert.equal(nextEvent(run), "TRAVEL");
        run.currentEventType = "TRAVEL";
        assert.equal(nextEvent(run), "COMBAT");

        recordCombatVictory(run, false);
        run.currentEventType = "TRAVEL";
        assert.equal(nextEvent(run), "SHOP");

        run.currentEventType = "SHOP";
        noteShopEntered(run, 1);
        assert.equal(run.fightsSinceShop, 0);
        assert.equal(run.shopEvery, 1);

        run.combatsThisTier = 3;
        run.fightsSinceShop = 1;
        run.currentEventType = "TRAVEL";
        assert.equal(nextEvent(run), "COMBAT");
        assert.equal(combatIsBoss(run, true), true);

        recordCombatVictory(run, true);
        assert.equal(run.tier, 2);
        assert.equal(run.combatsThisTier, 0);
        assert.equal(run.bossShopPending, true);
        run.currentEventType = "TRAVEL";
        assert.equal(nextEvent(run), "SHOP");
    });

    it("shops after the first fight when the gap is one", () => {
        const run = director(0, "TRAVEL");
        run.shopEvery = 1;
        assert.equal(nextEvent(run), "COMBAT");
        assert.equal(combatIsBoss(run, true), false);
        recordCombatVictory(run, false);
        run.currentEventType = "TRAVEL";
        assert.equal(nextEvent(run), "SHOP");
    });

    it("shops once more before the final boss, then sends the player to that fight", () => {
        const run = director(20, "TRAVEL");
        run.tier = 4;
        run.combatsThisTier = 3;
        run.fightsSinceShop = 0;
        assert.equal(nextEvent(run), "SHOP");
        assert.equal(combatIsBoss(run, true), true);

        run.currentEventType = "SHOP";
        noteShopEntered(run, 2);
        assert.equal(run.finalBossShopDone, true);
        run.currentEventType = "TRAVEL";
        assert.equal(nextEvent(run), "COMBAT");
        assert.equal(combatIsBoss(run, true), true);
    });

    it("opens a tier that has no regular tanks with its boss", () => {
        const intro = director(0, "TRAVEL");
        intro.tier = 0;
        assert.equal(nextEvent(intro), "COMBAT");
        assert.equal(combatIsBoss(intro, false), true);
    });

    it("treats the shop after the intro boss as the post-tutorial shop", () => {
        const shop = director(4, "SHOP");
        shop.tier = 1;
        shop.combatsThisTier = 0;
        assert.equal(isPostTutorialBossShop(shop), true);
        shop.currentEventType = "TRAVEL";
        assert.equal(isPostTutorialBossShop(shop), false);
        shop.currentEventType = "SHOP";
        shop.combatsThisTier = 1;
        assert.equal(isPostTutorialBossShop(shop), false);
        shop.combatsThisTier = 0;
        shop.tier = 0;
        assert.equal(isPostTutorialBossShop(shop), false);
    });
});

describe("travel journey bar", () => {
    it("stays hidden through the tutorial boss, then tracks the four tiers", () => {
        assert.equal(journeyVisible(0), false);
        assert.equal(journeyVisible(1), true);
        assert.deepEqual(journeyBossMarks(), [0.25, 0.5, 0.75]);
        assert.equal(journeyFraction(1, 0, 0), 0);
        assert.equal(journeyFraction(1, 3, 1), 0.25);
        assert.equal(journeyFraction(2, 0, 0), 0.25);
        assert.equal(journeyFraction(4, 3, 1), 1);
        assert.equal(journeyFraction(5, 0, 0), 1);
    });
});

describe("regular enemy picks", () => {
    const pool = [
        { fileName: "t1_small_2.json" },
        { fileName: "t1_cannon.json" },
        { fileName: "t1_medium.json" },
    ];

    it("skips the tank from the last fight when the pool has another", () => {
        for (let roll = 0; roll < 1; roll += 0.01) {
            const picked = chooseEnemyRecord(pool, "t1_cannon.json", roll);
            assert.notEqual(picked.fileName, "t1_cannon.json");
        }
        assert.equal(chooseEnemyRecord(pool, "t1_cannon.json", 0).fileName, "t1_small_2.json");
        assert.equal(chooseEnemyRecord(pool, "t1_cannon.json", 0.99).fileName, "t1_medium.json");
    });

    it("repeats the only tank in the pool", () => {
        const alone = [{ fileName: "t1_small_2.json" }];
        assert.equal(chooseEnemyRecord(alone, "t1_small_2.json", 0).fileName, "t1_small_2.json");
    });

    it("uses the whole pool when this tier has not fought that file", () => {
        assert.equal(chooseEnemyRecord(pool, "t2_small.json", 0).fileName, "t1_small_2.json");
        assert.equal(chooseEnemyRecord(pool, null, 0.99).fileName, "t1_medium.json");
    });
});