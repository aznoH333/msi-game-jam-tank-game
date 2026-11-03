import { ENEMY_CATALOG, type EnemyDefinition } from "./constants/enemyCatalog";
import { cellAt, isWalkable, type Maze } from "./maze";

export type EnemyAction = "idle" | "attack" | "chase" | "wander";

export const ENEMIES_PER_LEVEL = 10;
const HIT_RADIUS_CELLS = 0.35;
const BODY_RADIUS_CELLS = 0.22;
const CHASE_OFFSET_TILES = 0.15;

export interface EnemyActor {
    definition: EnemyDefinition;
    x: number;
    z: number;
    health: number;
    active: boolean;
    actionTimeLeft: number;
    action: EnemyAction;
    wanderX: number;
    wanderZ: number;
    /** World-space nudge applied while chasing, so the enemy doesn't walk at the player's exact point. */
    aimX: number;
    aimZ: number;
}

/** Attack if the player is in range and visible, otherwise chase on sight, otherwise wander. */
export function chooseAction(los: boolean, inRange: boolean, random: () => number): EnemyAction {
    if (los && inRange && random() < 1 / 3) {
        return "attack";
    }
    if (los) {
        return "chase";
    }
    return "wander";
}

export function hasLineOfSight(maze: Maze, fromX: number, fromZ: number, toX: number, toZ: number, cellSize: number): boolean {
    const distance = Math.hypot(toX - fromX, toZ - fromZ);
    const steps = Math.max(1, Math.ceil(distance / (cellSize * 0.25)));
    for (let step = 1; step < steps; step++) {
        const t = step / steps;
        const x = fromX + (toX - fromX) * t;
        const z = fromZ + (toZ - fromZ) * t;
        if (!isWalkable(cellAt(maze, Math.floor(x / cellSize), Math.floor(z / cellSize)))) {
            return false;
        }
    }
    return true;
}

/** Ten catalog enemies on distinct floor cells, never on the spawn. */
export function spawnEnemies(maze: Maze, cellSize: number, random: () => number = Math.random): EnemyActor[] {
    const blocked = new Set<string>([`${maze.spawnX},${maze.spawnY}`]);
    const floors: { x: number; y: number }[] = [];
    for (let y = 1; y < maze.size - 1; y++) {
        for (let x = 1; x < maze.size - 1; x++) {
            const key = `${x},${y}`;
            if (cellAt(maze, x, y) !== "floor" || blocked.has(key)) {
                continue;
            }
            floors.push({ x, y });
        }
    }
    for (let index = floors.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        const cell = floors[index];
        floors[index] = floors[swap];
        floors[swap] = cell;
    }
    const count = ENEMY_CATALOG.length === 0 ? 0 : Math.min(ENEMIES_PER_LEVEL, floors.length);
    const enemies: EnemyActor[] = [];
    for (let index = 0; index < count; index++) {
        const definition = ENEMY_CATALOG[Math.floor(random() * ENEMY_CATALOG.length)];
        const cell = floors[index];
        enemies.push({
            definition,
            x: (cell.x + 0.5) * cellSize,
            z: (cell.y + 0.5) * cellSize,
            health: definition.health,
            active: false,
            actionTimeLeft: 0,
            action: "idle",
            wanderX: 1,
            wanderZ: 0,
            aimX: 0,
            aimZ: 0,
        });
    }
    return enemies;
}

/** Advance one enemy. Returns damage dealt to the player this step. */
export function stepEnemy(
    enemy: EnemyActor,
    maze: Maze,
    playerX: number,
    playerZ: number,
    dt: number,
    cellSize: number,
    random: () => number,
): number {
    if (enemy.health <= 0) {
        return 0;
    }
    const seesPlayer = hasLineOfSight(maze, enemy.x, enemy.z, playerX, playerZ, cellSize);
    if (!enemy.active) {
        if (!seesPlayer) {
            return 0;
        }
        enemy.active = true;
        enemy.actionTimeLeft = 0;
    }

    enemy.actionTimeLeft -= dt;
    let damage = 0;
    if (enemy.actionTimeLeft <= 0) {
        const distance = Math.hypot(playerX - enemy.x, playerZ - enemy.z) / cellSize;
        const inRange = distance <= enemy.definition.attackRange;
        enemy.action = chooseAction(seesPlayer, inRange, random);
        enemy.actionTimeLeft = enemy.definition.actionTime;
        if (enemy.action === "attack") {
            damage = rollDamage(enemy.definition.damageMin, enemy.definition.damageMax, random);
        } else if (enemy.action === "chase") {
            const angle = random() * Math.PI * 2;
            const offset = CHASE_OFFSET_TILES * cellSize;
            enemy.aimX = Math.cos(angle) * offset;
            enemy.aimZ = Math.sin(angle) * offset;
        } else if (enemy.action === "wander") {
            const angle = random() * Math.PI * 2;
            enemy.wanderX = Math.cos(angle);
            enemy.wanderZ = Math.sin(angle);
        }
    }

    if (enemy.action === "chase") {
        moveToward(enemy, maze, playerX + enemy.aimX, playerZ + enemy.aimZ, dt, cellSize);
    } else if (enemy.action === "wander") {
        moveToward(enemy, maze, enemy.x + enemy.wanderX, enemy.z + enemy.wanderZ, dt, cellSize);
    }
    return damage;
}

/** Closest living enemy in front of the ray, inside the weapon range, with nothing solid between. */
export function enemyOnRay(
    enemies: EnemyActor[],
    originX: number,
    originZ: number,
    dirX: number,
    dirZ: number,
    maxDistance: number,
    cellSize: number,
    maze: Maze,
): EnemyActor | null {
    const hitRadius = HIT_RADIUS_CELLS * cellSize;
    let best: EnemyActor | null = null;
    let bestAlong = maxDistance;
    for (const enemy of enemies) {
        if (enemy.health <= 0) {
            continue;
        }
        const dx = enemy.x - originX;
        const dz = enemy.z - originZ;
        const along = dx * dirX + dz * dirZ;
        if (along < 0 || along > bestAlong) {
            continue;
        }
        const side = Math.abs(dx * dirZ - dz * dirX);
        if (side > hitRadius) {
            continue;
        }
        if (!hasLineOfSight(maze, originX, originZ, enemy.x, enemy.z, cellSize)) {
            continue;
        }
        best = enemy;
        bestAlong = along;
    }
    return best;
}

export function rollDamage(min: number, max: number, random: () => number): number {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + Math.floor(random() * (high - low + 1));
}

function moveToward(enemy: EnemyActor, maze: Maze, targetX: number, targetZ: number, dt: number, cellSize: number): void {
    const dx = targetX - enemy.x;
    const dz = targetZ - enemy.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) {
        return;
    }
    const step = Math.min(enemy.definition.movementSpeed * cellSize * dt, length);
    const moved = slide(maze, enemy.x, enemy.z, (dx / length) * step, (dz / length) * step, BODY_RADIUS_CELLS * cellSize, cellSize);
    enemy.x = moved.x;
    enemy.z = moved.z;
}

function slide(maze: Maze, x: number, z: number, dx: number, dz: number, radius: number, cellSize: number): { x: number; z: number } {
    let nextX = x;
    let nextZ = z;
    if (!hitsWall(maze, x + dx, z, radius, cellSize)) {
        nextX = x + dx;
    }
    if (!hitsWall(maze, nextX, z + dz, radius, cellSize)) {
        nextZ = z + dz;
    }
    return { x: nextX, z: nextZ };
}

function hitsWall(maze: Maze, x: number, z: number, radius: number, cellSize: number): boolean {
    const samples = [
        [x - radius, z - radius],
        [x + radius, z - radius],
        [x - radius, z + radius],
        [x + radius, z + radius],
    ];
    return samples.some(([sampleX, sampleZ]) => {
        return !isWalkable(cellAt(maze, Math.floor(sampleX / cellSize), Math.floor(sampleZ / cellSize)));
    });
}
