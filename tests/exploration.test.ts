import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellAt, generateMaze, isWalkable, MAZE_SIZE, type Maze, type MazeCell } from "../src/exploration/maze";

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
        }
    });
});

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
