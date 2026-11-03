import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENEMY_CATALOG } from "../src/exploration/constants/enemyCatalog";
import { chooseAction, enemyOnRay, hasLineOfSight, spawnEnemies, stepEnemy, type EnemyActor } from "../src/exploration/enemies";
import { cellAt, generateMaze, isWalkable, MAZE_SIZE, type Maze, type MazeCell } from "../src/exploration/maze";
import { ammoPackSources, loadout } from "../src/exploration/weapons";

function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function reachable(maze: Maze): Set<string> {
    const seen = new Set<string>();
    const pending = [[maze.spawnX, maze.spawnY]];
    while (pending.length > 0) {
        const next = pending.pop();
        if (!next) {
            break;
        }
        const [x, y] = next;
        const key = `${x},${y}`;
        if (seen.has(key) || !isWalkable(cellAt(maze, x, y))) {
            continue;
        }
        seen.add(key);
        pending.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return seen;
}

function countCells(maze: Maze, kind: MazeCell): number {
    return maze.cells.filter((cell) => cell === kind).length;
}

describe("exploration maze", () => {
    it("keeps a single border exit beside the spawn and connects every open cell", () => {
        for (let seed = 1; seed <= 12; seed++) {
            const maze = generateMaze(seeded(seed));
            assert.equal(maze.size, MAZE_SIZE);
            assert.equal(countCells(maze, "exit"), 1);
            assert.equal(cellAt(maze, maze.exitX, maze.exitY), "exit");
            assert.ok(
                maze.exitX === 0 || maze.exitY === 0 || maze.exitX === MAZE_SIZE - 1 || maze.exitY === MAZE_SIZE - 1,
            );
            assert.equal(Math.abs(maze.exitX - maze.spawnX) + Math.abs(maze.exitY - maze.spawnY), 1);
            assert.equal(cellAt(maze, maze.spawnX, maze.spawnY), "floor");

            const open = maze.cells.filter((cell) => isWalkable(cell)).length;
            assert.equal(reachable(maze).size, open);

            for (let index = 0; index < MAZE_SIZE; index++) {
                for (const [x, y] of [[index, 0], [index, MAZE_SIZE - 1], [0, index], [MAZE_SIZE - 1, index]] as const) {
                    if (x === maze.exitX && y === maze.exitY) {
                        continue;
                    }
                    assert.equal(cellAt(maze, x, y), "wall");
                }
            }
            assert.ok(countSeparateRooms(maze, 3) >= 4);
            assertPickups(maze);
        }
    });
});

function assertPickups(maze: Maze): void {
    assert.equal(maze.pickups.length, 6);
    const spots = new Set<string>();
    let money = 0;
    let modules = 0;
    let ammo = 0;
    for (const pickup of maze.pickups) {
        assert.equal(cellAt(maze, pickup.x, pickup.y), "floor");
        assert.ok(pickup.x !== maze.spawnX || pickup.y !== maze.spawnY);
        assert.ok(pickup.amount > 0);
        spots.add(`${pickup.x},${pickup.y}`);
        if (pickup.kind === "money") {
            money += 1;
        } else if (pickup.kind === "module") {
            modules += 1;
        } else {
            ammo += 1;
        }
    }
    assert.equal(spots.size, maze.pickups.length);
    assert.equal(money, 5);
    assert.equal(modules, 1);
    assert.equal(ammo, 0);
}

describe("exploration combat", () => {
    it("spawns ten catalog enemies on open cells away from the player", () => {
        const maze = generateMaze(seeded(3));
        const enemies = spawnEnemies(maze, 2, seeded(9));
        assert.equal(enemies.length, 10);
        const spots = new Set<string>();
        for (const enemy of enemies) {
            assert.equal(enemy.active, false);
            assert.ok(ENEMY_CATALOG.some((definition) => definition.name === enemy.definition.name));
            const cellX = Math.floor(enemy.x / 2);
            const cellY = Math.floor(enemy.z / 2);
            assert.equal(cellAt(maze, cellX, cellY), "floor");
            assert.ok(cellX !== maze.spawnX || cellY !== maze.spawnY);
            spots.add(`${cellX},${cellY}`);
        }
        assert.equal(spots.size, enemies.length);
    });

    it("attacks only on sight and in range, otherwise chases or wanders", () => {
        assert.equal(chooseAction(true, true, () => 0), "attack");
        assert.equal(chooseAction(true, true, () => 0.9), "chase");
        assert.equal(chooseAction(true, false, () => 0), "chase");
        assert.equal(chooseAction(false, true, () => 0), "wander");
    });

    it("keeps enemies asleep behind walls and lets a clear shot connect", () => {
        const open = gridMaze([
            "#####",
            "#...#",
            "#...#",
            "#...#",
            "#####",
        ]);
        assert.equal(hasLineOfSight(open, 1.5, 1.5, 3.5, 3.5, 1), true);
        const blocked = gridMaze([
            "#####",
            "#.#.#",
            "#.#.#",
            "#...#",
            "#####",
        ]);
        assert.equal(hasLineOfSight(blocked, 1.5, 1.5, 3.5, 1.5, 1), false);

        const melee = ENEMY_CATALOG[0];
        const enemy = actor(melee, 1.5, 1.5);
        stepEnemy(enemy, blocked, 3.5, 1.5, 0.2, 1, () => 0);
        assert.equal(enemy.active, false);

        const seen = actor(melee, 1.5, 1.5);
        const damage = stepEnemy(seen, open, 1.5, 1.8, 0.2, 1, () => 0);
        assert.equal(seen.action, "attack");
        assert.ok(damage >= melee.damageMin && damage <= melee.damageMax);

        const far = actor(melee, 1.5, 1.5);
        stepEnemy(far, open, 3.5, 3.5, 0.2, 1, () => 0);
        assert.equal(far.action, "chase");
        assert.ok(Math.abs(Math.hypot(far.aimX, far.aimZ) - 0.15) < 1e-6);

        const ranged = actor(ENEMY_CATALOG[1], 1.5, 1.5);
        const hit = enemyOnRay([ranged], 1.5, 3.2, 0, -1, 4, 1, open);
        assert.equal(hit, ranged);
        assert.equal(enemyOnRay([ranged], 1.5, 3.2, 0, -1, 0.4, 1, open), null);
        assert.equal(enemyOnRay([ranged], 3.5, 1.5, -1, 0, 4, 1, blocked), null);
    });

    it("spawns ammo packs only for unlocked weapons that spend ammo", () => {
        assert.deepEqual(ammoPackSources({ fists: 0, pistol: 50 }), [{ weapon: "pistol", amount: 10 }]);
        assert.deepEqual(ammoPackSources({ fists: 0 }), []);

        for (let seed = 1; seed <= 6; seed++) {
            const maze = generateMaze(seeded(seed), [
                { weapon: "pistol", amount: 10 },
                { weapon: "shotgun", amount: 4 },
            ]);
            const ammo = maze.pickups.filter((pickup) => pickup.kind === "ammo");
            assert.equal(ammo.length, 5);
            assert.equal(maze.pickups.length, 11);
            const spots = new Set(maze.pickups.map((pickup) => `${pickup.x},${pickup.y}`));
            assert.equal(spots.size, maze.pickups.length);
            for (const pickup of ammo) {
                assert.equal(cellAt(maze, pickup.x, pickup.y), "floor");
                assert.ok(pickup.x !== maze.spawnX || pickup.y !== maze.spawnY);
                assert.ok(pickup.weapon === "pistol" || pickup.weapon === "shotgun");
                assert.equal(pickup.amount, pickup.weapon === "pistol" ? 10 : 4);
            }
        }
    });

    it("offers only the weapons the player has unlocked", () => {
        const weapons = loadout({ pistol: 50 });
        assert.deepEqual(weapons.map((weapon) => weapon.definition.name), ["pistol"]);
        assert.equal(weapons[0].ammo, 50);
        assert.equal(loadout({}).length, 0);
    });
});

function gridMaze(rows: string[]): Maze {
    const size = rows.length;
    const cells: MazeCell[] = [];
    for (const row of rows) {
        for (const symbol of row) {
            cells.push(symbol === "#" ? "wall" : "floor");
        }
    }
    return {
        size,
        cells,
        exitX: 0,
        exitY: 1,
        spawnX: 1,
        spawnY: 1,
        spawnYaw: 0,
        pickups: [],
    };
}

function actor(definition: EnemyActor["definition"], x: number, z: number): EnemyActor {
    return {
        definition,
        x,
        z,
        health: definition.health,
        active: false,
        actionTimeLeft: 0,
        action: "idle",
        wanderX: 1,
        wanderZ: 0,
        aimX: 0,
        aimZ: 0,
    };
}

function countSeparateRooms(maze: Maze, span: number): number {
    const used = new Set<string>();
    let count = 0;
    for (let y = 0; y <= maze.size - span; y++) {
        for (let x = 0; x <= maze.size - span; x++) {
            const cells: string[] = [];
            let open = true;
            for (let dy = 0; dy < span && open; dy++) {
                for (let dx = 0; dx < span; dx++) {
                    if (!isWalkable(cellAt(maze, x + dx, y + dy))) {
                        open = false;
                        break;
                    }
                    cells.push(`${x + dx},${y + dy}`);
                }
            }
            if (!open || cells.some((cell) => used.has(cell))) {
                continue;
            }
            for (const cell of cells) {
                used.add(cell);
            }
            count++;
        }
    }
    return count;
}
