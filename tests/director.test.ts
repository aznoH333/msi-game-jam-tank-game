import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markShopCheckpoint, rewindToCheckpoint } from "../src/gamedirector/checkpoint";
import type { GameDirector } from "../src/gamedirector/gamedirector";
import { PERSON_HEALTH_MAX, initPlayerData } from "../src/game/playerData";

function director(eventIndex: number, currentEventType: GameDirector["currentEventType"], lastCheckPoint = 0): GameDirector {
    return { eventIndex, lastCheckPoint, currentEventType, enemyIndex: 0 };
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
        rewindToCheckpoint(run, player, (index) => (index === 8 ? "SHOP" : "COMBAT"));
        assert.equal(run.eventIndex, 8);
        assert.equal(run.currentEventType, "SHOP");
        assert.equal(player.personHealth, PERSON_HEALTH_MAX);
        assert.equal(player.money, 1234);
    });
});