import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TILE_CATALOG } from "../src/building/constants/tileCatalog";
import { buyOffer, shopOffers } from "../src/building/itemShop";
import { tankTrackColumns, tankTrackSprite } from "../src/building/tankTracks";
import type { PlacedTile, WeaponOverclockInstance } from "../src/building/types/tiles";
import { serializeVehicle, vehicleFromSave } from "../src/building/vehicleSave";
import { adjustOverclock, availableOverclockModules, getOverclockedTurretStats, modulesInTile } from "../src/building/vehicleUtils";
import { brokenVehicleRules, buyOverclockModule, OVERCLOCK_MODULE_PRICE } from "../src/building/vehicleRules";
import { initPlayerData } from "../src/game/playerData";

const NEEDS_GUN = "The vehicle needs a gun.";
const MUST_CONNECT = "All tiles must be connected. Disjointed islands are not allowed.";
const TOO_MANY_WEAPONS = "Not enough weapon slots.";
const TOO_TALL = "The vehicle can be at most twice as tall as it is wide.";

function part(x: number, y: number, width = 1, height = 1, gun = false): PlacedTile {
    return {
        x,
        y,
        overclocks: [],
        base: {
            tileName: gun ? "Gun" : "Block",
            type: gun ? "WEAPON" : "BLOCK",
            tileSprite: "tiles/debug_tiles_0002",
            width,
            height,
            price: 0,
            health: 1,
            turret: gun
                ? {
                    turretSprite: "tiles/debug_turret",
                    damagePerShot: 1,
                    powerPerShot: 1,
                    salvoCount: 1,
                    salvoDelay: 0,
                    accuracy: 0,
                    reloadTime: 1,
                    overClocks: [],
                    projectileSpeed: 1,
                    explosionRadius: 0,
                    projectileType: "direct",
                }
                : undefined,
        },
    };
}

function warnings(tiles: PlacedTile[]): string[] {
    return brokenVehicleRules({ name: "Tank", tiles }).map((failure) => failure.explanation);
}

describe("vehicle launch rules", () => {
    it("requires a gun even when the vehicle is empty or one block", () => {
        assert.deepEqual(warnings([]), [NEEDS_GUN]);
        assert.deepEqual(warnings([part(0, 0)]), [NEEDS_GUN]);
    });

    it("accepts a gun on its own", () => {
        assert.deepEqual(warnings([part(0, 0, 2, 2, true)]), []);
    });

    it("treats parts that share an edge as one vehicle", () => {
        assert.deepEqual(warnings([part(0, 0), part(1, 0)]), [NEEDS_GUN]);
        assert.deepEqual(warnings([
            part(0, 0, 2, 2, true),
            part(2, 1),
        ]), []);
        assert.deepEqual(warnings([
            part(0, 0),
            part(1, 0, 2, 2, true),
            part(3, 1),
        ]), []);
    });

    it("rejects more guns than the player has weapon slots", () => {
        const guns = [part(0, 0, 2, 2, true), part(2, 0, 2, 2, true)];
        assert.deepEqual(brokenVehicleRules({ name: "Tank", tiles: guns }, 1).map((failure) => failure.explanation), [TOO_MANY_WEAPONS]);
        assert.deepEqual(brokenVehicleRules({ name: "Tank", tiles: guns }, 2), []);
    });

    it("rejects a corner touch and any separate island", () => {
        assert.deepEqual(warnings([part(0, 0), part(1, 1)]), [NEEDS_GUN, MUST_CONNECT]);
        assert.deepEqual(warnings([
            part(0, 0, 2, 2, true),
            part(2, 2),
        ]), [MUST_CONNECT]);
        assert.deepEqual(warnings([
            part(0, 0),
            part(1, 0, 1, 1, true),
            part(4, 0),
        ]), [MUST_CONNECT]);
    });

    it("rejects a vehicle more than twice as tall as it is wide", () => {
        assert.deepEqual(warnings([
            part(0, 0, 2, 2, true),
            part(0, 2),
            part(0, 3),
        ]), []);
        assert.deepEqual(warnings([
            part(0, 0, 2, 2, true),
            part(0, 2),
            part(0, 3),
            part(0, 4),
        ]), [TOO_TALL]);
        assert.deepEqual(warnings([
            part(0, 0, 1, 1, true),
            part(1, 0),
            part(2, 0),
            part(3, 0),
        ]), []);
    });
});

function overclock(value: number): WeaponOverclockInstance {
    return {
        value,
        base: {
            name: "Damage overclock",
            baseValue: 0,
            minValue: -0.5,
            maxValue: 1,
            stepSize: 0.25,
            stepCost: 1,
            damage: 1,
        },
    };
}

describe("overclock modules", () => {
    it("spends one module per step above stock and refunds it on the way down", () => {
        const installed = overclock(0);
        const raised = adjustOverclock(installed, 1, 3);
        assert.deepEqual(raised, { value: 0.25, modules: 2 });

        const blocked = adjustOverclock(installed, 1, 0);
        assert.equal(blocked, null);

        const lowered = adjustOverclock({ ...installed, value: 0.25 }, -1, 2);
        assert.deepEqual(lowered, { value: 0, modules: 3 });
    });

    it("does not pay modules for tuning at or below the stock value", () => {
        const stock = overclock(0);
        const down = adjustOverclock(stock, -1, 3);
        assert.deepEqual(down, { value: -0.25, modules: 3 });

        const back = adjustOverclock(overclock(-0.25), 1, 0);
        assert.deepEqual(back, { value: 0, modules: 0 });
        assert.equal(adjustOverclock(overclock(-0.5), -1, 3), null);
        assert.equal(adjustOverclock(overclock(1), 1, 3), null);
    });

    it("adds jam and fail chance on top of a base of zero", () => {
        const turret = part(0, 0, 1, 1, true).base.turret;
        assert.ok(turret);
        const plain = getOverclockedTurretStats(turret, []);
        assert.equal(plain.jamChance, 0);
        assert.equal(plain.failChance, 0);

        const tuned = getOverclockedTurretStats(turret, [{
            base: {
                name: "Risky",
                baseValue: 0,
                minValue: 0,
                maxValue: 1,
                stepSize: 0.25,
                stepCost: 1,
                jamChance: 0.2,
                failChance: 0.1,
            },
            value: 0.5,
        }]);
        assert.equal(tuned.jamChance, 0.1);
        assert.equal(tuned.failChance, 0.05);
    });

    it("counts the modules a sold gun should return", () => {
        const gun = part(0, 0, 1, 1, true);
        gun.overclocks = [overclock(0.5), overclock(-0.25)];
        assert.equal(modulesInTile(gun), 2);
        gun.overclocks = [overclock(0)];
        assert.equal(modulesInTile(gun), 0);
    });

    it("spends and refunds the slider step cost", () => {
        const slider = overclock(0);
        slider.base.stepCost = 3;
        const raised = adjustOverclock(slider, 1, 3);
        assert.deepEqual(raised, { value: 0.25, modules: 0 });
        assert.equal(adjustOverclock(slider, 1, 2), null);

        const lowered = adjustOverclock({ ...slider, value: 0.25 }, -1, 0);
        assert.deepEqual(lowered, { value: 0, modules: 3 });

        const gun = part(0, 0, 1, 1, true);
        gun.overclocks = [{ ...slider, value: 0.5 }];
        assert.equal(modulesInTile(gun), 6);
    });

    it("counts free modules and modules already installed on the vehicle", () => {
        const gun = part(0, 0, 1, 1, true);
        gun.overclocks = [overclock(0.5)];
        assert.equal(availableOverclockModules(2, [gun, part(1, 0)]), 4);
        assert.equal(availableOverclockModules(0, [gun]), 2);
    });
});

describe("overclock module shop", () => {
    it("sells one module for a flat price and refuses the sale without the money", () => {
        const player = initPlayerData();
        player.money = OVERCLOCK_MODULE_PRICE;
        player.overclockModules = 0;
        assert.equal(buyOverclockModule(player), true);
        assert.equal(player.overclockModules, 1);
        assert.equal(player.money, 0);
        assert.equal(buyOverclockModule(player), false);
        assert.equal(player.overclockModules, 1);
    });
});

describe("item shop", () => {
    it("sells purchasable guns, their ammo, and a medpack", () => {
        const titles = shopOffers().map((offer) => offer.title);
        assert.deepEqual(titles, [
            "Medpack",
            "pistol ammo",
            "shotgun",
            "shotgun ammo",
            "machine gun",
            "machine gun ammo",
            "plasma gun",
        ]);
    });

    it("buys a medpack up to full health and refuses a second one", () => {
        const player = initPlayerData();
        player.personHealth = 40;
        player.money = 500;
        const medpack = shopOffers()[0];
        assert.equal(buyOffer(player, medpack), true);
        assert.equal(player.personHealth, 100);
        assert.equal(player.money, 0);
        assert.equal(buyOffer(player, medpack), false);
    });

    it("unlocks a gun with no ammo and sells ammo only for guns the player has", () => {
        const player = initPlayerData();
        player.money = 20_000;
        const offers = shopOffers();
        const shotgun = offers.find((offer) => offer.kind === "weapon" && offer.weapon === "shotgun");
        const pistolAmmo = offers.find((offer) => offer.kind === "ammo" && offer.weapon === "pistol");
        const shotgunAmmo = offers.find((offer) => offer.kind === "ammo" && offer.weapon === "shotgun");
        assert.ok(shotgun);
        assert.ok(pistolAmmo);
        assert.ok(shotgunAmmo);

        assert.equal(buyOffer(player, shotgunAmmo), false);
        assert.equal(buyOffer(player, shotgun), true);
        assert.equal(player.weapons.shotgun, 0);
        assert.equal(player.money, 10_000);
        assert.equal(buyOffer(player, shotgun), false);

        assert.equal(buyOffer(player, pistolAmmo), true);
        assert.equal(player.weapons.pistol, 60);
        player.weapons.pistol = 100;
        assert.equal(buyOffer(player, pistolAmmo), false);
        assert.equal(player.weapons.pistol, 100);
    });
});

describe("tank tracks", () => {
    it("extends the outer columns by one tile and shifts them inward", () => {
        assert.deepEqual(tankTrackColumns([]), []);
        assert.deepEqual(tankTrackColumns([
            { x: 2, y: 1, width: 1, height: 3 },
            { x: 4, y: 0, width: 2, height: 2 },
        ]), [
            { x: 2.5, y: 0.5, length: 4 },
            { x: 4.5, y: -0.5, length: 3 },
        ]);
        assert.deepEqual(tankTrackColumns([
            { x: 0, y: 2, width: 1, height: 1 },
        ]), [
            { x: -0.25, y: 1.5, length: 2 },
            { x: 0.25, y: 1.5, length: 2 },
        ]);
    });

    it("cycles the tread once per tile of travel and holds still at a fixed distance", () => {
        assert.equal(tankTrackSprite(0), "tiles/tiles_1x1_0009");
        assert.equal(tankTrackSprite(1 / 3), "tiles/tiles_1x1_0010");
        assert.equal(tankTrackSprite(2 / 3), "tiles/tiles_1x1_0011");
        assert.equal(tankTrackSprite(1), "tiles/tiles_1x1_0009");
        assert.equal(tankTrackSprite(4), tankTrackSprite(4));
    });
});

describe("vehicle files", () => {
    it("stores the tile name, position, and overclock values, then rebuilds from the catalog", () => {
        const gun = TILE_CATALOG.WEAPON.find((tile) => tile.tileName === "Machine gun");
        const frame = TILE_CATALOG.BLOCK.find((tile) => tile.tileName === "Metal frame");
        assert.ok(gun?.turret);
        assert.ok(frame);
        const saved = serializeVehicle({
            name: "Test",
            tiles: [
                {
                    base: gun,
                    x: 3,
                    y: 4,
                    overclocks: gun.turret.overClocks.map((slider, index) => ({
                        base: slider,
                        value: index === 0 ? 2 : slider.baseValue,
                    })),
                },
                { base: frame, x: 1, y: 1, overclocks: [] },
            ],
        });
        assert.deepEqual(saved.tiles[0], {
            tileName: "Machine gun",
            x: 3,
            y: 4,
            overclocks: [
                { name: "Salvo extender", value: 2 },
                { name: "Speed loader", value: 0 },
                { name: "Oversized shells", value: 0 },
            ],
        });

        const loaded = vehicleFromSave(saved);
        assert.equal(loaded.name, "Test");
        assert.equal(loaded.tiles[0].base.health, gun.health);
        assert.equal(loaded.tiles[0].base.turret?.damagePerShot, gun.turret.damagePerShot);
        assert.notEqual(loaded.tiles[0].base, gun);
        assert.equal(loaded.tiles[0].overclocks[0].value, 2);
        assert.equal(loaded.tiles[0].overclocks[0].base, loaded.tiles[0].base.turret?.overClocks[0]);
        assert.equal(loaded.tiles[1].base.tileName, "Metal frame");
        assert.equal(loaded.tiles[1].x, 1);
        assert.throws(() => vehicleFromSave({
            name: "Missing",
            tiles: [{ tileName: "Not a tile", x: 0, y: 0, overclocks: [] }],
        }));
    });
});
