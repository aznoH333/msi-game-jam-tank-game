import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedTile } from "../src/building/types/tiles";
import type { BaseVehicle } from "../src/building/types/vehicle";
import { FAIL_DAMAGE_OF_MAX_HEALTH, JAM_ENERGY_MULTIPLIER, OPENING_FIRE_DELAY, REPAIR_DURATION } from "../src/combat/constants";
import { FAULT_ICON_DURATION, iconFlashAlpha } from "../src/combat/statusIcons";
import { combatMatch } from "../src/combat/testHarness";
import { lootSprite, recommendedModules, rollLootReward, streetLoot } from "../src/combat/travelLoot";

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

/** Keeps a target tank from being wiped just because it has no gun. */
function crewGun(): PlacedTile {
    const part = gun(40, 40, 1, 1);
    part.base.health = 1000;
    return part;
}

describe("combat loop", () => {
    it("leaves both tanks intact when nobody fires", () => {
        const outcome = combatMatch(
            vehicle("Player", [block(0, 0, 100), crewGun()]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        ).run(5);

        assert.equal(outcome.winner, null);
        assert.equal(outcome.player.healthRatio, 1);
        assert.equal(outcome.enemy.healthRatio, 1);
        assert.ok(Math.abs(outcome.time - 5) < 1e-8);
    });

    it("damages the aimed tile and not the shooter", () => {
        const match = combatMatch(
            vehicle("Player", [gun(0, 0, 30, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const aim = match.tile("enemy", 0);
        const outcome = match.at(0, "player", { fire: { gun: 0, at: aim } }).run(1);

        assert.equal(outcome.winner, null);
        assert.equal(outcome.enemy.tiles[0].health, 70);
        assert.equal(outcome.player.tiles[0].health, 200);
        assert.ok(outcome.player.energy < 105);
    });

    it("holds the enemy's first shot until the opening delay ends", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100), crewGun()]),
            vehicle("Enemy", [gun(0, 0, 30, 10), battery(2, 0)]),
        );
        const aim = match.tile("player", 0);
        const held = match.at(0, "enemy", { fire: { gun: 0, at: aim } }).run(OPENING_FIRE_DELAY);
        assert.equal(held.player.tiles[0].health, 100);

        const landed = match.at(OPENING_FIRE_DELAY, "enemy", { fire: { gun: 0, at: aim } }).run(1);
        assert.equal(landed.player.tiles[0].health, 70);
    });

    it("destroys an enemy tank that has no living weapon, and leaves a hurt player in the fight", () => {
        const disarmed = combatMatch(
            vehicle("Player", [gun(0, 0, 10, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100)]),
        ).run(0.05);
        assert.equal(disarmed.winner, "player");
        assert.equal(disarmed.enemy.healthRatio, 0);
        assert.equal(disarmed.enemy.tiles[0].health, 0);
        assert.equal(disarmed.player.healthRatio, 1);

        const hurt = combatMatch(
            vehicle("Player", [block(0, 0, 100), crewGun()]),
            vehicle("Enemy", [gun(0, 0, 90, 10), battery(2, 0)]),
        );
        const playerTile = hurt.tile("player", 0);
        const outcome = hurt.at(OPENING_FIRE_DELAY, "enemy", { fire: { gun: 0, at: playerTile } }).run(1 + OPENING_FIRE_DELAY);
        assert.equal(outcome.winner, null);
        assert.equal(outcome.player.tiles[0].health, 10);

        const dead = combatMatch(
            vehicle("Player", [block(0, 0, 100)]),
            vehicle("Enemy", [gun(0, 0, 90, 10), battery(2, 0)]),
        ).run(0.05);
        assert.equal(dead.winner, "enemy");
        assert.equal(dead.player.healthRatio, 0);
        assert.equal(dead.player.tiles[0].health, 0);
    });

    it("pays the enemy bounty when the player wins, and nothing otherwise", () => {
        const bounty = 3000;
        const win = combatMatch(
            vehicle("Player", [gun(0, 0, 90, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100)]),
            bounty,
        );
        const enemyTile = win.tile("enemy", 0);
        assert.equal(win.state().moneyDropped, 0);
        const won = win.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: enemyTile } }).run(2 + OPENING_FIRE_DELAY);

        assert.equal(won.winner, "player");
        assert.equal(won.moneyDropped, bounty);
        assert.ok(won.sounds.includes("weapons/explosion"));

        const loss = combatMatch(
            vehicle("Player", [block(0, 0, 100), crewGun()]),
            vehicle("Enemy", [gun(0, 0, 90, 10), battery(2, 0)]),
            bounty,
        );
        const playerTile = loss.tile("player", 0);
        const lost = loss.at(OPENING_FIRE_DELAY, "enemy", { fire: { gun: 0, at: playerTile } }).run(2 + OPENING_FIRE_DELAY);

        assert.equal(lost.winner, null);
        assert.equal(lost.player.tiles[0].health, 10);
        assert.equal(lost.moneyDropped, 0);
    });

    it("does not fire a gun that costs more energy than the tank has", () => {
        const match = combatMatch(
            vehicle("Player", [gun(0, 0, 50, 10)]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const aim = match.tile("enemy", 0);
        const outcome = match.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: aim } }).run(1 + OPENING_FIRE_DELAY);

        assert.equal(outcome.enemy.tiles[0].health, 100);
        assert.equal(outcome.winner, null);
        assert.ok(outcome.player.energy <= 5);
    });

    it("reloads a gun when a salvo stops because the tank is out of energy", () => {
        const playerGun = gun(0, 0, 20, 3);
        playerGun.base.turret!.salvoCount = 2;
        playerGun.base.turret!.reloadTime = 10;
        const match = combatMatch(
            vehicle("Player", [playerGun]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const aim = match.tile("enemy", 0);
        const outcome = match
            .at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: aim } })
            .at(1.5, "player", { fire: { gun: 0, at: aim } })
            .run(1.5);

        assert.equal(outcome.enemy.tiles[0].health, 80);
    });

    it("lets the enemy's scripted shot damage the player", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100), crewGun()]),
            vehicle("Enemy", [gun(0, 0, 25, 10), battery(2, 0)]),
        );
        const aim = match.tile("player", 0);
        const outcome = match.at(OPENING_FIRE_DELAY, "enemy", { fire: { gun: 0, at: aim } }).run(1 + OPENING_FIRE_DELAY);

        assert.equal(outcome.player.tiles[0].health, 75);
        assert.equal(outcome.enemy.healthRatio, 1);
        assert.equal(outcome.winner, null);
    });

    it("repairs the user's own living tiles over time", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100), crewGun()]),
            vehicle("Enemy", [gun(0, 0, 40, 10), battery(2, 0)]),
        );
        const wounded = match.tile("player", 0);
        const outcome = match
            .at(OPENING_FIRE_DELAY, "enemy", { fire: { gun: 0, at: wounded } })
            .at(OPENING_FIRE_DELAY + 0.5, "player", { repair: { at: wounded } })
            .run(OPENING_FIRE_DELAY + 0.5 + REPAIR_DURATION);

        assert.equal(outcome.winner, null);
        // 40 damage, then five heals of 5 across the five-second circle.
        assert.ok(
            Math.abs(outcome.player.tiles[0].health - 85) < 0.05,
            `expected about 85, got ${outcome.player.tiles[0].health}`,
        );
        assert.ok(outcome.player.repairCooldown > 0);
    });

    it("restores a destroyed tile on the first repair tick, then keeps healing it", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100), block(8, 0, 100), crewGun()]),
            vehicle("Enemy", [gun(0, 0, 100, 10), battery(2, 0)]),
        );
        const destroyed = match.tile("player", 0);
        const outcome = match
            .at(OPENING_FIRE_DELAY, "enemy", { fire: { gun: 0, at: destroyed } })
            .at(OPENING_FIRE_DELAY + 0.5, "player", { repair: { at: destroyed } })
            .run(OPENING_FIRE_DELAY + 0.5 + REPAIR_DURATION);

        assert.equal(outcome.winner, null);
        // Back to 10% on the first tick, then four heals of 5 across the rest of the circle.
        assert.ok(
            Math.abs(outcome.player.tiles[0].health - 30) < 0.05,
            `expected about 30, got ${outcome.player.tiles[0].health}`,
        );
        assert.equal(outcome.player.tiles[1].health, 100);
    });

    it("jams a shot, ends the salvo, and spends one and a half shots of energy", () => {
        const playerGun = gun(0, 0, 40, 10);
        playerGun.base.powerCapacity = 100;
        playerGun.base.turret!.salvoCount = 3;
        playerGun.overclocks = [chanceOverclock("jamChance")];
        const match = combatMatch(
            vehicle("Player", [playerGun]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const outcome = match.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: match.tile("enemy", 0) } }).run(OPENING_FIRE_DELAY + 0.05);

        assert.equal(outcome.enemy.tiles[0].health, 100);
        assert.equal(outcome.player.tiles[0].health, 200);
        assert.ok(Math.abs(outcome.player.energy - (105 - 10 * JAM_ENERGY_MULTIPLIER)) < 0.001);
    });

    it("fails a shot, ends the salvo, and blasts the gun for a quarter of its health", () => {
        const playerGun = gun(0, 0, 40, 10);
        playerGun.base.powerCapacity = 100;
        playerGun.base.turret!.salvoCount = 3;
        playerGun.overclocks = [chanceOverclock("failChance")];
        const match = combatMatch(
            vehicle("Player", [playerGun]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const outcome = match.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: match.tile("enemy", 0) } }).run(OPENING_FIRE_DELAY + 0.05);

        assert.equal(outcome.enemy.tiles[0].health, 100);
        assert.equal(outcome.player.tiles[0].health, 200 - 200 * FAIL_DAMAGE_OF_MAX_HEALTH);
        assert.ok(Math.abs(outcome.player.energy - (105 - 10)) < 0.001);
    });

    it("throws more sparks from a harder hit, then lets them fly out and fade", () => {
        const light = combatMatch(
            vehicle("Player", [gun(0, 0, 30, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const lightAim = light.tile("enemy", 0);
        const lightHit = light.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: lightAim } }).run(OPENING_FIRE_DELAY + 0.25);
        assert.ok(lightHit.sparks.length > 0);
        for (const spark of lightHit.sparks) {
            assert.ok(Math.hypot(spark.x - lightAim.x, spark.y - lightAim.y) > 0.3);
        }
        assert.equal(light.run(1).sparks.length, 0);

        const heavy = combatMatch(
            vehicle("Player", [gun(0, 0, 60, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const heavyHit = heavy.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: heavy.tile("enemy", 0) } }).run(OPENING_FIRE_DELAY + 0.25);
        assert.ok(heavyHit.sparks.length > lightHit.sparks.length);
    });

    it("plays a weapon's firing sound when it shoots and its impact sound when the shot lands", () => {
        const playerGun = gun(0, 0, 30, 10);
        const turret = playerGun.base.turret;
        if (!turret) {
            throw new Error("gun has no turret");
        }
        turret.firingSound = "weapons/cannon_small";
        turret.impactSound = "weapons/explosion_small";
        const match = combatMatch(
            vehicle("Player", [playerGun, battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        match.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: match.tile("enemy", 0) } });
        let fired = false;
        for (let step = 0; step < 40; step++) {
            const state = match.run(0.05, 0.05);
            if (state.sounds.includes("weapons/cannon_small")) {
                fired = true;
            }
            if (state.enemy.tiles[0].health < 100) {
                assert.equal(fired, true);
                assert.ok(state.sounds.includes("weapons/explosion_small"));
                return;
            }
        }
        assert.equal(fired, true);
    });

    it("flashes a jam icon twice over two seconds, and a fail icon when the gun explodes", () => {
        assert.equal(iconFlashAlpha(0, FAULT_ICON_DURATION), 1);
        assert.ok(Math.abs(iconFlashAlpha(0.5, FAULT_ICON_DURATION) - 0.5) < 1e-9);
        assert.equal(iconFlashAlpha(1, FAULT_ICON_DURATION), 1);
        assert.equal(iconFlashAlpha(FAULT_ICON_DURATION, FAULT_ICON_DURATION), 0);
        assert.equal(iconFlashAlpha(5), 1);

        const jammedGun = gun(0, 0, 40, 10);
        jammedGun.base.powerCapacity = 100;
        jammedGun.overclocks = [chanceOverclock("jamChance")];
        const jammed = combatMatch(
            vehicle("Player", [jammedGun]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        jammed.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: jammed.tile("enemy", 0) } });
        const jam = jammed.run(OPENING_FIRE_DELAY + 0.05);
        assert.equal(jam.player.tiles[0].fault, "jam");
        assert.equal(jam.player.tiles[0].faultAge, 0);
        assert.ok(jam.sounds.includes("weapons/weapon_jam"));
        const secondFlash = jammed.run(1);
        assert.equal(secondFlash.player.tiles[0].fault, "jam");
        assert.ok(Math.abs(secondFlash.player.tiles[0].faultAge - 1) < 1e-6);
        const cleared = jammed.run(1);
        assert.equal(cleared.player.tiles[0].fault, null);

        const failedGun = gun(0, 0, 40, 10);
        failedGun.base.powerCapacity = 100;
        failedGun.overclocks = [chanceOverclock("failChance")];
        const failed = combatMatch(
            vehicle("Player", [failedGun]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const fail = failed.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: failed.tile("enemy", 0) } }).run(OPENING_FIRE_DELAY + 0.05);
        assert.equal(fail.player.tiles[0].fault, "fail");
        assert.ok(fail.sounds.includes("weapons/weapon_jam"));
        assert.ok(fail.sounds.includes("weapons/explosion_small"));
    });

    it("flashes a repaired tile green, and leaves an untouched tile alone", () => {
        const match = combatMatch(
            vehicle("Player", [block(0, 0, 100), block(8, 0, 100), crewGun()]),
            vehicle("Enemy", [gun(0, 0, 40, 10), battery(2, 0)]),
        );
        const wounded = match.tile("player", 0);
        match.at(OPENING_FIRE_DELAY, "enemy", { fire: { gun: 0, at: wounded } }).at(OPENING_FIRE_DELAY + 0.5, "player", { repair: { at: wounded } });
        match.run(OPENING_FIRE_DELAY + 0.5);
        const healed = match.run(1);
        assert.equal(healed.player.tiles[0].healFlash, 1);
        assert.ok(healed.player.tiles[0].health > 60);
        assert.equal(healed.player.tiles[1].healFlash, 0);
        assert.equal(healed.player.tiles[1].health, 100);
        const faded = match.run(0.05);
        assert.equal(faded.player.tiles[0].healFlash, 0);
    });

    it("turns a damaged tile white, then fades that back over 50ms", () => {
        const match = combatMatch(
            vehicle("Player", [gun(0, 0, 30, 10), battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const aim = match.tile("enemy", 0);
        match.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: aim } });
        match.run(OPENING_FIRE_DELAY);
        let hit = false;
        for (let step = 0; step < 40; step++) {
            const state = match.run(0.01, 0.01);
            if (state.enemy.tiles[0].health >= 100) {
                continue;
            }
            assert.equal(state.enemy.tiles[0].flash, 1);
            assert.equal(state.player.tiles[0].flash, 0);
            const fading = match.run(0.02, 0.02);
            assert.ok(Math.abs(fading.enemy.tiles[0].flash - 0.6) < 1e-6);
            const gone = match.run(0.03, 0.03);
            assert.equal(gone.enemy.tiles[0].flash, 0);
            hit = true;
            break;
        }
        assert.equal(hit, true);
    });

    it("plays repair when a circle starts, and weapon ready when a gun can fire again", () => {
        const repaired = combatMatch(
            vehicle("Player", [block(0, 0, 100), crewGun()]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const circle = repaired.at(0, "player", { repair: { at: repaired.tile("player", 0) } }).run(0.05);
        assert.equal(circle.sounds.filter((name) => name === "combat/repair").length, 1);
        const still = repaired.run(0.2);
        assert.equal(still.sounds.filter((name) => name === "combat/repair").length, 1);

        const playerGun = gun(0, 0, 20, 10);
        const turret = playerGun.base.turret;
        if (!turret) {
            throw new Error("gun has no turret");
        }
        turret.reloadTime = 0.2;
        const match = combatMatch(
            vehicle("Player", [playerGun, battery(2, 0)]),
            vehicle("Enemy", [block(0, 0, 100), crewGun()]),
        );
        const fired = match.at(OPENING_FIRE_DELAY, "player", { fire: { gun: 0, at: match.tile("enemy", 0) } }).run(OPENING_FIRE_DELAY + 0.05);
        assert.equal(fired.sounds.includes("combat/weapon_ready"), false);
        const ready = match.run(0.25);
        assert.equal(ready.sounds.filter((name) => name === "combat/weapon_ready").length, 1);
    });
});

describe("travel loot", () => {
    it("lays the same containers down for a trip", () => {
        const first = streetLoot(2, 5, 200);
        assert.deepEqual(streetLoot(2, 5, 200), first);
        assert.ok(first.length > 1);
        assert.notDeepEqual(streetLoot(4, 5, 200).map((piece) => piece.z), first.map((piece) => piece.z));
    });

    it("pays a module only while the player is under 5 per tier, on an even coin flip", () => {
        assert.equal(recommendedModules(1), 5);
        assert.equal(recommendedModules(2), 10);
        assert.deepEqual(rollLootReward(4, 1, 0.1), { kind: "module", amount: 1 });
        assert.deepEqual(rollLootReward(4, 1, 0.5), { kind: "money", amount: 500 });
        assert.deepEqual(rollLootReward(5, 1, 0.1), { kind: "money", amount: 500 });
        assert.deepEqual(rollLootReward(9, 2, 0), { kind: "module", amount: 1 });
        assert.deepEqual(rollLootReward(10, 2, 0), { kind: "money", amount: 500 });
    });

    it("holds each loot blink frame for half a second", () => {
        assert.equal(lootSprite("crate", 0, 0), "world/loot/crate");
        assert.equal(lootSprite("crate", 0.49, 0), "world/loot/crate");
        assert.equal(lootSprite("crate", 0.5, 0), "world/loot/crate_blink");
        assert.equal(lootSprite("trash_1", 1, 0), "world/loot/trash_1");
    });
});

function chanceOverclock(kind: "jamChance" | "failChance"): PlacedTile["overclocks"][number] {
    return {
        base: {
            name: kind,
            baseValue: 0,
            minValue: 0,
            maxValue: 1,
            stepSize: 1,
            stepCost: 1,
            [kind]: 1,
        },
        value: 1,
    };
}
