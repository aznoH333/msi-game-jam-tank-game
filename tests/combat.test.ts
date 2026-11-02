import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedTile } from "../src/building/types/tiles";
import type { BaseVehicle } from "../src/building/types/vehicle";
import { REPAIR_DURATION } from "../src/combat/constants";
import { combatMatch } from "../src/combat/testHarness";

function block(x: number, y: number, health: number): PlacedTile {
    return {
        x,
        y,
        overclocks: [],
        base: {
            tileName: "Block",
            type: "BLOCK",
            tileSprite: "tiles/debug_tiles_0002",
            width: 1,
            height: 1,
            price: 0,
            health,
        },
    };
}

function battery(x: number, y: number): PlacedTile {
    return {
        x,
        y,
        overclocks: [],
        base: {
            tileName: "Battery",
            type: "UTILITY",
            tileSprite: "tiles/debug_battery_small",
            width: 1,
            height: 1,
            price: 0,
            health: 100,
            powerCapacity: 100,
        },
    };
}

function gun(x: number, y: number, damage: number, powerPerShot: number): PlacedTile {
    return {
        x,
        y,
        overclocks: [],
        base: {
            tileName: "Gun",
            type: "WEAPON",
            tileSprite: "tiles/debug_turret_base",
            width: 1,
            height: 1,
            price: 0,
            health: 200,
            turret: {
                turretSprite: "tiles/debug_turret",
                accuracy: 0,
                damagePerShot: damage,
                powerPerShot,
                salvoCount: 1,
                salvoDelay: 0,
                reloadTime: 10,
                explosionRadius: 0.4,
                projectileSpeed: 400,
                projectileType: "direct",
                overClocks: [],
            },
        },
    };
}

function vehicle(name: string, tiles: PlacedTile[]): BaseVehicle {
    return { name, tiles };
}

describe("combat loop", () => {
    it("leaves both tanks intact when nobody fires", () => {
        const outcome = combatMatch(
            vehicle("Player", [block(0, 0, 100)]),
            vehicle("Enemy", [block(0, 0, 100)]),
        ).run(5);

        assert.equal(outcome.winner, null);
        assert.equal(outcome.player.healthRatio, 1);
        assert.equal(outcome.enemy.healthRatio, 1);
        assert.ok(Math.abs(outcome.time - 5) < 1e-8);
    });

    it("damages the aimed tile and not the shooter", () => {
        const match = combatMatch(
            vehicle("Player", [gun(0, 0, 30, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100)]),
        );
        const aim = match.tile("enemy", 0);
        const outcome = match.at(0, "player", { fire: { gun: 0, at: aim } }).run(1);

        assert.equal(outcome.winner, null);
        assert.equal(outcome.enemy.tiles[0].health, 70);
        assert.equal(outcome.player.tiles[0].health, 200);
        assert.ok(outcome.player.energy < 105);
    });

    it("gives the win to whoever drops the other tank under 20% health", () => {
        const match = combatMatch(
            vehicle("Player", [gun(0, 0, 90, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100)]),
        );
        const aim = match.tile("enemy", 0);
        const outcome = match.at(0, "player", { fire: { gun: 0, at: aim } }).run(1);

        assert.equal(outcome.winner, "player");
        assert.equal(outcome.enemy.healthRatio, 0);
        assert.equal(outcome.enemy.tiles[0].health, 0);
        assert.equal(outcome.player.healthRatio, 1);
    });

    it("does not fire a gun that costs more energy than the tank has", () => {
        const match = combatMatch(
            vehicle("Player", [gun(0, 0, 50, 10)]),
            vehicle("Enemy", [block(0, 0, 100)]),
        );
        const aim = match.tile("enemy", 0);
        const outcome = match.at(0, "player", { fire: { gun: 0, at: aim } }).run(1);

        assert.equal(outcome.enemy.tiles[0].health, 100);
        assert.equal(outcome.winner, null);
        assert.ok(outcome.player.energy <= 5);
    });

    it("lets the enemy's scripted shot damage the player", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100)]),
            vehicle("Enemy", [gun(0, 0, 25, 10), battery(2, 0)]),
        );
        const aim = match.tile("player", 0);
        const outcome = match.at(0, "enemy", { fire: { gun: 0, at: aim } }).run(1);

        assert.equal(outcome.player.tiles[0].health, 75);
        assert.equal(outcome.enemy.healthRatio, 1);
        assert.equal(outcome.winner, null);
    });

    it("repairs the user's own living tiles over time", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100)]),
            vehicle("Enemy", [gun(0, 0, 40, 10), battery(2, 0)]),
        );
        const wounded = match.tile("player", 0);
        const outcome = match
            .at(0, "enemy", { fire: { gun: 0, at: wounded } })
            .at(0.5, "player", { repair: { at: wounded } })
            .run(0.5 + REPAIR_DURATION);

        assert.equal(outcome.winner, null);
        assert.ok(
            Math.abs(outcome.player.tiles[0].health - 72.5) < 0.05,
            `expected about 72.5, got ${outcome.player.tiles[0].health}`,
        );
        assert.ok(outcome.player.repairCooldown > 0);
    });

    it("brings a destroyed tile on the repairing tank back to 10% when the circle finishes", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100), block(8, 0, 100)]),
            vehicle("Enemy", [gun(0, 0, 100, 10), battery(2, 0)]),
        );
        const destroyed = match.tile("player", 0);
        const outcome = match
            .at(0, "enemy", { fire: { gun: 0, at: destroyed } })
            .at(0.5, "player", { repair: { at: destroyed } })
            .run(0.5 + REPAIR_DURATION);

        assert.equal(outcome.winner, null);
        assert.equal(outcome.player.tiles[0].health, 10);
        assert.equal(outcome.player.tiles[1].health, 100);
    });
});
