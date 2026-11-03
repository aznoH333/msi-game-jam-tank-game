export const MAZE_SIZE = 30;
const ROOM_COUNT = 6;
const ROOM_ATTEMPTS = 200;

export type MazeCell = "wall" | "floor" | "exit";

export interface Maze {
    size: number;
    cells: MazeCell[];
    exitX: number;
    exitY: number;
    spawnX: number;
    spawnY: number;
    /** Faces into the maze, away from the exit. Radians, same convention as the 3D camera. */
    spawnYaw: number;
}

export function cellAt(maze: Maze, x: number, y: number): MazeCell {
    if (x < 0 || y < 0 || x >= maze.size || y >= maze.size) {
        return "wall";
    }
    return maze.cells[y * maze.size + x];
}

export function isWalkable(cell: MazeCell): boolean {
    return cell === "floor" || cell === "exit";
}

/** A perfect maze on a 30×30 grid, with rectangular rooms carved into it. The exit is one border cell, and the spawn is the floor beside it. */
export function generateMaze(random: () => number = Math.random): Maze {
    const size = MAZE_SIZE;
    const cells: MazeCell[] = Array.from({ length: size * size }, () => "wall");
    const at = (x: number, y: number) => y * size + x;
    const visited = new Set<number>();
    const stack = [{ x: 1, y: 1 }];
    visited.add(at(1, 1));
    cells[at(1, 1)] = "floor";
    const steps = [[2, 0], [-2, 0], [0, 2], [0, -2]];

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const open = steps.filter(([dx, dy]) => {
            const nextX = current.x + dx;
            const nextY = current.y + dy;
            return nextX >= 1 && nextY >= 1 && nextX <= size - 3 && nextY <= size - 3 && !visited.has(at(nextX, nextY));
        });
        if (open.length === 0) {
            stack.pop();
            continue;
        }
        const step = open[Math.floor(random() * open.length)];
        const nextX = current.x + step[0];
        const nextY = current.y + step[1];
        cells[at(current.x + step[0] / 2, current.y + step[1] / 2)] = "floor";
        cells[at(nextX, nextY)] = "floor";
        visited.add(at(nextX, nextY));
        stack.push({ x: nextX, y: nextY });
    }

    const edge: { x: number; y: number }[] = [];
    for (let y = 1; y <= size - 3; y += 2) {
        edge.push({ x: 1, y }, { x: size - 3, y });
    }
    for (let x = 3; x <= size - 5; x += 2) {
        edge.push({ x, y: 1 }, { x, y: size - 3 });
    }
    const door = edge[Math.floor(random() * edge.length)];
    const exits: { x: number; y: number }[] = [];
    if (door.x === 1) {
        exits.push({ x: 0, y: door.y });
    }
    if (door.x === size - 3) {
        exits.push({ x: size - 1, y: door.y });
    }
    if (door.y === 1) {
        exits.push({ x: door.x, y: 0 });
    }
    if (door.y === size - 3) {
        exits.push({ x: door.x, y: size - 1 });
    }
    const exit = exits[Math.floor(random() * exits.length)];
    const spawnX = exit.x === 0 ? 1 : exit.x === size - 1 ? size - 2 : door.x;
    const spawnY = exit.y === 0 ? 1 : exit.y === size - 1 ? size - 2 : door.y;
    cells[at(spawnX, spawnY)] = "floor";
    cells[at(exit.x, exit.y)] = "exit";
    carveRooms(cells, size, random);

    return {
        size,
        cells,
        exitX: exit.x,
        exitY: exit.y,
        spawnX,
        spawnY,
        spawnYaw: yawAwayFrom(exit.x - spawnX, exit.y - spawnY),
    };
}

/** Open rectangles, 3–5 cells on a side, kept off the border and apart from each other. */
function carveRooms(cells: MazeCell[], size: number, random: () => number): void {
    const rooms: { x: number; y: number; width: number; depth: number }[] = [];
    for (let attempt = 0; attempt < ROOM_ATTEMPTS && rooms.length < ROOM_COUNT; attempt++) {
        const width = 3 + Math.floor(random() * 3);
        const depth = 3 + Math.floor(random() * 3);
        const x = 1 + Math.floor(random() * (size - 1 - width));
        const y = 1 + Math.floor(random() * (size - 1 - depth));
        const blocked = rooms.some((room) => {
            return x < room.x + room.width + 1 && x + width + 1 > room.x && y < room.y + room.depth + 1 && y + depth + 1 > room.y;
        });
        if (blocked) {
            continue;
        }
        for (let iy = y; iy < y + depth; iy++) {
            for (let ix = x; ix < x + width; ix++) {
                const index = iy * size + ix;
                if (cells[index] !== "exit") {
                    cells[index] = "floor";
                }
            }
        }
        rooms.push({ x, y, width, depth });
    }
}

/** Yaw 0 looks down +Z. The exit direction is one step on a grid axis. */
function yawAwayFrom(exitDx: number, exitDy: number): number {
    if (exitDx < 0) {
        return -Math.PI / 2;
    }
    if (exitDx > 0) {
        return Math.PI / 2;
    }
    if (exitDy < 0) {
        return 0;
    }
    return Math.PI;
}
