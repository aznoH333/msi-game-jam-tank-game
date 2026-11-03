import { drawAbilityBarMoney } from "../combat/abilityBar";
import { drawRect, GAME_HEIGHT, GAME_WIDTH } from "../drawing/canvas";
import { boxTriangles, drawScene3D, planeTriangles, type Billboard3D, type Triangle3D, type Vec3 } from "../drawing/3d";
import { drawText, measureText } from "../drawing/text";
import { getGameState } from "../game/gameState";
import { transitionToNextEvent } from "../gamedirector/gamedirector";
import { isKeyDown, isMouseButtonDown } from "../input/input";
import { enemyOnRay, rollDamage, spawnEnemies, stepEnemy, type EnemyActor } from "./enemies";
import { cellAt, generateMaze, isWalkable, type Maze, type MazePickup } from "./maze";
import { WeaponCatalog } from "./constants/weaponCatalog";
import { ammoPackSources, loadout, type HeldWeapon } from "./weapons";

/** Each maze cell is a cube this many world units on a side. */
const CELL_SIZE = 2;
const WALL_HEIGHT = CELL_SIZE;
const EYE_HEIGHT = CELL_SIZE * 0.62;
const MOVE_SPEED = 3.4 * CELL_SIZE;
const TURN_SPEED = 2.3;
const BODY_RADIUS = 0.18 * CELL_SIZE;
const LEAVE_DISTANCE = 1.25 * CELL_SIZE;
const FLOOR_COLOR = "#3c4452";
const CEILING_COLOR = "#141820";
const FOG_START = 3.5 * CELL_SIZE;
const FOG_END = 6 * CELL_SIZE;
const PICKUP_SIZE = 0.5;
const PICKUP_COLOR = { money: "#e6c07b", module: "#8ecbff", ammo: "#b7e38a" } as const;
const LOW_HEALTH = 30;
const ENEMY_WIDTH = CELL_SIZE * 0.7;
const ENEMY_HEIGHT = CELL_SIZE * 0.95;
const WALL_FACE = {
    north: "#5c636c",
    south: "#a7adb6",
    west: "#6e757f",
    east: "#8d939c",
} as const;

interface Exploration {
    eventIndex: number;
    maze: Maze;
    walls: Triangle3D[];
    pickups: MazePickup[];
    triangles: Triangle3D[];
    enemies: EnemyActor[];
    weapons: HeldWeapon[];
    weaponIndex: number;
    hotkeysDown: Set<number>;
    x: number;
    z: number;
    yaw: number;
}

let exploration: Exploration | null = null;
let lastUpdateMs = 0;
let leaveWasDown = false;

/** First-person maze. Walk with WASD, turn with the arrow keys, and press E at the exit. */
export function updateExplore(): void {
    const state = getGameState();
    const now = performance.now();
    if (!exploration || exploration.eventIndex !== state.gameDirector.eventIndex) {
        const maze = generateMaze(Math.random, ammoPackSources(state.playerData.weapons));
        const walls = mazeTriangles(maze);
        const pickups = maze.pickups.map((pickup) => ({ ...pickup }));
        exploration = {
            eventIndex: state.gameDirector.eventIndex,
            maze,
            walls,
            pickups,
            triangles: viewTriangles(walls, pickups),
            enemies: spawnEnemies(maze, CELL_SIZE),
            weapons: loadout(state.playerData.weapons),
            weaponIndex: 0,
            hotkeysDown: new Set(),
            x: cellCenter(maze.spawnX),
            z: cellCenter(maze.spawnY),
            yaw: maze.spawnYaw,
        };
        lastUpdateMs = now;
        leaveWasDown = isKeyDown("KeyE");
    }
    const run = exploration;
    const dt = Math.min(0.05, Math.max(0, (now - lastUpdateMs) / 1000));
    lastUpdateMs = now;
    const player = state.playerData;
    if (player.personHealth > 0) {
        stepPlayer(run, dt);
        fireWeapon(run, dt);
        collectPickups(run);
        let damage = 0;
        for (const enemy of run.enemies) {
            damage += stepEnemy(enemy, run.maze, run.x, run.z, dt, CELL_SIZE, Math.random);
        }
        player.personHealth = Math.max(0, player.personHealth - damage);
        run.enemies = run.enemies.filter((enemy) => enemy.health > 0);
    }

    drawScene3D({
        viewport: { x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT },
        background: "#000000",
        horizon: {
            sky: CEILING_COLOR,
            ground: FLOOR_COLOR,
            eyeAboveFloor: EYE_HEIGHT,
            eyeBelowCeiling: WALL_HEIGHT - EYE_HEIGHT,
        },
        fog: { color: "#000000", start: FOG_START, end: FOG_END },
        camera: {
            position: { x: run.x, y: EYE_HEIGHT, z: run.z },
            yaw: run.yaw,
            pitch: 0,
            fov: Math.PI / 3,
        },
        triangles: run.triangles,
        billboards: enemyBillboards(run.enemies),
    });
    drawAbilityBarMoney(state.playerData.money, state.playerData.overclockModules);
    drawCombatHud(run, player.personHealth);
    if (player.personHealth <= 0) {
        transitionToNextEvent();
        return;
    }

    const leaveDown = isKeyDown("KeyE");
    const leavePressed = leaveDown && !leaveWasDown;
    leaveWasDown = leaveDown;
    if (!nearExit(run)) {
        return;
    }
    drawLeavePrompt();
    if (leavePressed) {
        transitionToNextEvent();
    }
}

function stepPlayer(run: Exploration, dt: number): void {
    if (isKeyDown("ArrowLeft")) {
        run.yaw += TURN_SPEED * dt;
    }
    if (isKeyDown("ArrowRight")) {
        run.yaw -= TURN_SPEED * dt;
    }
    const forwardX = -Math.sin(run.yaw);
    const forwardZ = Math.cos(run.yaw);
    const rightX = Math.cos(run.yaw);
    const rightZ = Math.sin(run.yaw);
    let wishX = 0;
    let wishZ = 0;
    if (isKeyDown("KeyW") || isKeyDown("ArrowUp")) {
        wishX += forwardX;
        wishZ += forwardZ;
    }
    if (isKeyDown("KeyS") || isKeyDown("ArrowDown")) {
        wishX -= forwardX;
        wishZ -= forwardZ;
    }
    if (isKeyDown("KeyD")) {
        wishX += rightX;
        wishZ += rightZ;
    }
    if (isKeyDown("KeyA")) {
        wishX -= rightX;
        wishZ -= rightZ;
    }
    const length = Math.hypot(wishX, wishZ);
    if (length === 0) {
        return;
    }
    const scale = MOVE_SPEED * dt / length;
    const moved = slide(run.maze, run.x, run.z, wishX * scale, wishZ * scale);
    run.x = moved.x;
    run.z = moved.z;
}

function slide(maze: Maze, x: number, z: number, dx: number, dz: number): { x: number; z: number } {
    let nextX = x;
    let nextZ = z;
    if (!overlapsWall(maze, x + dx, z)) {
        nextX = x + dx;
    }
    if (!overlapsWall(maze, nextX, z + dz)) {
        nextZ = z + dz;
    }
    return { x: nextX, z: nextZ };
}

function overlapsWall(maze: Maze, x: number, z: number): boolean {
    const samples = [
        [x - BODY_RADIUS, z - BODY_RADIUS],
        [x + BODY_RADIUS, z - BODY_RADIUS],
        [x - BODY_RADIUS, z + BODY_RADIUS],
        [x + BODY_RADIUS, z + BODY_RADIUS],
    ];
    return samples.some(([sampleX, sampleZ]) => {
        return !isWalkable(cellAt(maze, Math.floor(sampleX / CELL_SIZE), Math.floor(sampleZ / CELL_SIZE)));
    });
}

function cellCenter(cell: number): number {
    return (cell + 0.5) * CELL_SIZE;
}

function fireWeapon(run: Exploration, dt: number): void {
    const pressed = new Set<number>();
    for (let index = 0; index < run.weapons.length; index++) {
        const hotkey = run.weapons[index].definition.weaponHotkey;
        const down = isKeyDown(`Digit${hotkey}`);
        if (down && !run.hotkeysDown.has(hotkey)) {
            run.weaponIndex = index;
        }
        if (down) {
            pressed.add(hotkey);
        }
    }
    run.hotkeysDown = pressed;

    const weapon = run.weapons[run.weaponIndex];
    if (!weapon) {
        return;
    }
    weapon.cooldown = Math.max(0, weapon.cooldown - dt);
    const definition = weapon.definition;
    if (!isMouseButtonDown(0) || weapon.cooldown > 0) {
        return;
    }
    if (!definition.infiniteAmmo && weapon.ammo <= 0) {
        return;
    }
    weapon.cooldown = 1 / definition.shotsPerSecond;
    if (!definition.infiniteAmmo) {
        weapon.ammo -= 1;
        getGameState().playerData.weapons[definition.name] = weapon.ammo;
    }
    const forwardX = -Math.sin(run.yaw);
    const forwardZ = Math.cos(run.yaw);
    const hit = enemyOnRay(
        run.enemies,
        run.x,
        run.z,
        forwardX,
        forwardZ,
        definition.range * CELL_SIZE,
        CELL_SIZE,
        run.maze,
    );
    if (!hit) {
        return;
    }
    hit.health -= rollDamage(definition.damageMin, definition.damageMax, Math.random);
}

function enemyBillboards(enemies: EnemyActor[]): Billboard3D[] {
    return enemies.map((enemy) => ({
        position: { x: enemy.x, y: ENEMY_HEIGHT / 2, z: enemy.z },
        width: ENEMY_WIDTH,
        height: ENEMY_HEIGHT,
        sprite: enemy.definition.sprite,
    }));
}

function drawCombatHud(run: Exploration, health: number): void {
    drawText({
        text: `Health ${Math.ceil(health)}`,
        x: 24,
        y: 28,
        font: "22px sans-serif",
        color: health <= LOW_HEALTH ? "#ff8b8b" : "#f4fff6",
        align: "left",
        baseline: "middle",
    });
    const weapon = run.weapons[run.weaponIndex];
    if (!weapon) {
        return;
    }
    const ammo = weapon.definition.infiniteAmmo ? "inf" : String(weapon.ammo);
    const text = `${weapon.definition.weaponHotkey}  ${weapon.definition.name}  ${ammo}`;
    const font = "22px sans-serif";
    const width = measureText(text, font) + 36;
    const x = (GAME_WIDTH - width) / 2;
    const y = 16;
    drawRect({ x, y, width, height: 36, color: "#1b1f2a" });
    drawText({
        text,
        x: x + width / 2,
        y: y + 18,
        font,
        color: "#f4fff6",
        align: "center",
        baseline: "middle",
    });
    drawRect({ x: GAME_WIDTH / 2 - 8, y: GAME_HEIGHT / 2 - 1, width: 16, height: 2, color: "#f4fff6" });
    drawRect({ x: GAME_WIDTH / 2 - 1, y: GAME_HEIGHT / 2 - 8, width: 2, height: 16, color: "#f4fff6" });
}

function takeAmmo(run: Exploration, pickup: MazePickup): boolean {
    if (!pickup.weapon) {
        return false;
    }
    const definition = WeaponCatalog.find((weapon) => weapon.name === pickup.weapon);
    const current = getGameState().playerData.weapons[pickup.weapon];
    if (!definition || current === undefined || definition.infiniteAmmo) {
        return false;
    }
    const ammo = Math.min(definition.ammoMax, current + pickup.amount);
    getGameState().playerData.weapons[pickup.weapon] = ammo;
    const held = run.weapons.find((weapon) => weapon.definition.name === pickup.weapon);
    if (held) {
        held.ammo = ammo;
    }
    return true;
}

function collectPickups(run: Exploration): void {
    const cellX = Math.floor(run.x / CELL_SIZE);
    const cellY = Math.floor(run.z / CELL_SIZE);
    const state = getGameState();
    let taken = false;
    run.pickups = run.pickups.filter((pickup) => {
        if (pickup.x !== cellX || pickup.y !== cellY) {
            return true;
        }
        if (pickup.kind === "money") {
            state.playerData.money += pickup.amount;
        } else if (pickup.kind === "module") {
            state.playerData.overclockModules += pickup.amount;
        } else if (!takeAmmo(run, pickup)) {
            return true;
        }
        taken = true;
        return false;
    });
    if (taken) {
        run.triangles = viewTriangles(run.walls, run.pickups);
    }
}

function viewTriangles(walls: Triangle3D[], pickups: MazePickup[]): Triangle3D[] {
    const triangles = walls.slice();
    for (const pickup of pickups) {
        triangles.push(...boxTriangles(
            { x: cellCenter(pickup.x), y: PICKUP_SIZE / 2, z: cellCenter(pickup.y) },
            { x: PICKUP_SIZE, y: PICKUP_SIZE, z: PICKUP_SIZE },
            PICKUP_COLOR[pickup.kind],
        ));
    }
    return triangles;
}

function nearExit(run: Exploration): boolean {
    const dx = run.x - cellCenter(run.maze.exitX);
    const dz = run.z - cellCenter(run.maze.exitY);
    return dx * dx + dz * dz <= LEAVE_DISTANCE * LEAVE_DISTANCE;
}

function drawLeavePrompt(): void {
    const font = "22px sans-serif";
    const text = "E  Leave";
    const width = measureText(text, font) + 48;
    const height = 52;
    const x = (GAME_WIDTH - width) / 2;
    const y = GAME_HEIGHT - 96;
    drawRect({
        x,
        y,
        width,
        height,
        color: "#1b1f2a",
    });
    drawText({
        text,
        x: x + width / 2,
        y: y + height / 2,
        font,
        color: "#f4fff6",
        align: "center",
        baseline: "middle",
    });
}

/** Floor and ceiling are a horizon fill. Only the exit marker and walls are triangles. */
function mazeTriangles(maze: Maze): Triangle3D[] {
    const triangles = planeTriangles(
        { x: cellCenter(maze.exitX), y: 0.03, z: cellCenter(maze.exitY) },
        CELL_SIZE,
        CELL_SIZE,
        "#2f9e44",
    );
    for (let y = 0; y < maze.size; y++) {
        for (let x = 0; x < maze.size; x++) {
            if (cellAt(maze, x, y) !== "wall") {
                continue;
            }
            if (isWalkable(cellAt(maze, x, y - 1))) {
                pushWallFace(triangles, x, y, x + 1, y, WALL_FACE.north);
            }
            if (isWalkable(cellAt(maze, x, y + 1))) {
                pushWallFace(triangles, x + 1, y + 1, x, y + 1, WALL_FACE.south);
            }
            if (isWalkable(cellAt(maze, x - 1, y))) {
                pushWallFace(triangles, x, y + 1, x, y, WALL_FACE.west);
            }
            if (isWalkable(cellAt(maze, x + 1, y))) {
                pushWallFace(triangles, x + 1, y, x + 1, y + 1, WALL_FACE.east);
            }
        }
    }
    return triangles;
}

function pushWallFace(triangles: Triangle3D[], x0: number, z0: number, x1: number, z1: number, color: string): void {
    const a: Vec3 = { x: x0 * CELL_SIZE, y: 0, z: z0 * CELL_SIZE };
    const b: Vec3 = { x: x1 * CELL_SIZE, y: 0, z: z1 * CELL_SIZE };
    const c: Vec3 = { x: x1 * CELL_SIZE, y: WALL_HEIGHT, z: z1 * CELL_SIZE };
    const d: Vec3 = { x: x0 * CELL_SIZE, y: WALL_HEIGHT, z: z0 * CELL_SIZE };
    triangles.push({ a, b, c, color }, { a, b: c, c: d, color });
}
