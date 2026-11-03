import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlacedTile, WeaponOverclockInstance } from "../src/building/types/tiles";
import { adjustOverclock, modulesInTile } from "../src/building/vehicleUtils";
import { brokenVehicleRules } from "../src/building/vehicleRules";

const NEEDS_GUN = "The vehicle needs a gun.";
const MUST_CONNECT = "All tiles must be connected. Disjointed islands are not allowed.";

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

    it("counts the modules a sold gun should return", () => {
        const gun = part(0, 0, 1, 1, true);
        gun.overclocks = [overclock(0.5), overclock(-0.25)];
        assert.equal(modulesInTile(gun), 2);
        gun.overclocks = [overclock(0)];
        assert.equal(modulesInTile(gun), 0);
    });
});
