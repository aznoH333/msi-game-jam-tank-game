import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameDirector } from "../src/gamedirector/gamedirector";
import { enemyBounty, initPlayerData } from "../src/game/playerData";
import { fromSavedRun, toSavedRun, type SavedTutorials } from "../src/game/save";

const tutorials: SavedTutorials = {
    firstCombatTutorialDone: true,
    overclockTutorialDone: false,
    trashTutorialDone: true,
    trashTutorialQueued: false,
};

function director(): GameDirector {
    return {
        eventIndex: 4,
        lastCheckPoint: 2,
        currentEventType: "SHOP",
        tier: 2,
        combatsThisTier: 1,
        fightsSinceShop: 0,
        shopEvery: 2,
        bossShopPending: false,
        finalBossShopDone: false,
        lastEnemyFile: "t1_cannon.json",
    };
}

describe("saved run", () => {
    it("stores the tank, money, and where the run stopped", () => {
        const player = initPlayerData();
        player.money = 4321;
        player.overclockModules = 3;
        player.unlockedTiles.push("Cannon");
        const saved = toSavedRun(player, director(), "BUILDING_SCREEN", tutorials);
        const loaded = fromSavedRun(JSON.parse(JSON.stringify(saved)));
        assert.ok(loaded);
        assert.equal(loaded.player.money, 4321);
        assert.equal(loaded.player.overclockModules, 3);
        assert.ok(loaded.player.unlockedTiles.includes("Cannon"));
        assert.equal(loaded.player.vehicle.name, player.vehicle.name);
        assert.equal(loaded.player.vehicle.tiles.length, player.vehicle.tiles.length);
        assert.equal(loaded.director.tier, 2);
        assert.equal(loaded.director.lastEnemyFile, "t1_cannon.json");
        assert.equal(loaded.screen, "BUILDING_SCREEN");
        assert.equal(loaded.player.difficulty, "hard");
        assert.equal(loaded.player.vehicleWeaponSlots, 3);
        assert.equal(loaded.tutorials.firstCombatTutorialDone, true);
        assert.equal(loaded.tutorials.overclockTutorialDone, false);

        const normal = initPlayerData("normal");
        assert.equal(normal.vehicleWeaponSlots, 4);
        assert.equal(enemyBounty(2000, "hard"), 2000);
        assert.equal(enemyBounty(2000, "normal"), 2400);
        const withoutDifficulty = JSON.parse(JSON.stringify(saved)) as { player: { difficulty?: string } };
        delete withoutDifficulty.player.difficulty;
        const legacy = fromSavedRun(withoutDifficulty);
        assert.ok(legacy);
        assert.equal(legacy.player.difficulty, "hard");
    });

    it("rejects a save that is missing the run", () => {
        assert.equal(fromSavedRun(null), null);
        assert.equal(fromSavedRun({ player: {}, director: {}, tutorials: {}, screen: "MAIN_MENU" }), null);
    });
});
