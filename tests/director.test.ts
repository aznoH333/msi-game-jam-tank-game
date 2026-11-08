import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markShopCheckpoint, rewindToCheckpoint } from "../src/gamedirector/checkpoint";
import type { GameDirector } from "../src/gamedirector/gamedirector";
import { combatIsBoss, nextEvent, noteShopEntered, recordCombatVictory } from "../src/gamedirector/schedule";
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
        noteShopEntered(run, 3);
        assert.equal(run.fightsSinceShop, 0);
        assert.equal(run.shopEvery, 3);

        run.combatsThisTier = 5;
        run.fightsSinceShop = 3;
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

    it("opens a tier that has no regular tanks with its boss", () => {
        const intro = director(0, "TRAVEL");
        intro.tier = 0;
        assert.equal(nextEvent(intro), "COMBAT");
        assert.equal(combatIsBoss(intro, false), true);
    });
});