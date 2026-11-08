import { playSound, setEngineBlend } from "../audio/audio";
import { placedWeaponCount } from "../building/vehicleRules";
import { availableOverclockModules, getPowerPerSecond, getTotalPowerCapacity } from "../building/vehicleUtils";
import type { BaseVehicle } from "../building/types/vehicle";
import { drawRect, GAME_HEIGHT, GAME_WIDTH } from "../drawing/canvas";
import { boxTriangles, drawScene3D, planeTriangles, projectBillboard, type Billboard3D, type Camera3D, type FaceTexture, type SkySprite, type Triangle3D, type Vec3 } from "../drawing/3d";
import { drawSprite } from "../drawing/sprites";
import { drawText, measureText } from "../drawing/text";
import { getGameState } from "../game/gameState";
import { chooseExploration, directorAttempt, getNextEventType, transitionToNextEvent, type EventType } from "../gamedirector/gamedirector";
import { getMousePosition, isMouseButtonDown } from "../input/input";
import { ABILITY_BAR_WIDTH, drawAbilityBar, drawAbilityBarMoney, drawViewEnergy } from "./abilityBar";
import { lootIcon, lootLabel, lootSprite, rollLootReward, streetLoot, LOOT_FADE_SECONDS, LOOT_POPUP_SECONDS, type LootReward, type StreetLoot } from "./travelLoot";
import { drawCombatVehicle } from "./combatView";
import type { VehicleInstance } from "./types/vehicleInstance";

const DRIVE_SPEED = 11;
/** Seconds to speed up from a stop, and to slow down again before the sprite. */
const RAMP_TIME = 0.5;
const CAMERA_HEIGHT = 1.5;
/** Quadratic drop. The ground falls out of sight near sqrt(CAMERA_HEIGHT / STREET_CURVE). */
const STREET_CURVE = 0.004;
const BLOCK_DEPTH = 7;
const STREET_HALF = 6.2;
/** How long a drive lasts, picked again each trip. */
const TRAVEL_MIN_SECONDS = 5;
const TRAVEL_MAX_SECONDS = 20;
/** How far in front of the sprite the camera stops. */
const STOP_AHEAD = 10;
const EVENT_WIDTH = 6;
const EVENT_HEIGHT = 4.6;
const EVENT_CENTER_Y = 2.3;
const SHOP_EVENT_SPRITE = "world/events/overworld_shop";
const COMBAT_EVENT_SPRITE = "world/events/overworld_tank_0001";
const EVENT_SPRITE = "world/events/debug_event";
const SKY_TOP = "#b4202a";
const SKY_BOTTOM = "#ffd541";
const ROAD_SPRITE = "world/textures/road";
const ROAD_TEX_WIDTH = 200;
const ROAD_TEX_HEIGHT = 63;
const TRASH_SPRITES = [
    "world/trash/trash_0001",
    "world/trash/trash_0002",
    "world/trash/trash_0003",
    "world/trash/trash_0004",
    "world/trash/trash_0005",
    "world/trash/trash_0006",
];
/** Trash frames are 12×9. One pixel matches a pixel of the road texture. */
const TRASH_WIDTH = 12 * (STREET_HALF * 2) / ROAD_TEX_WIDTH;
const TRASH_HEIGHT = 9 * (STREET_HALF * 2) / ROAD_TEX_WIDTH;
const TRASH_SPACING = 2.2;
/** Loot frames are 15×14. One pixel matches a pixel of the road texture. */
const LOOT_WIDTH = 15 * (STREET_HALF * 2) / ROAD_TEX_WIDTH;
const LOOT_HEIGHT = 14 * (STREET_HALF * 2) / ROAD_TEX_WIDTH;
const BUILDING_SPRITES = [
    "world/textures/buildings_0001",
    "world/textures/buildings_0002",
    "world/textures/buildings_0003",
];
const BUILDING_TEX_WIDTH = 112;
const BUILDING_TEX_HEIGHT = 178;
const ROOF_COLOR = "#5daf8d";

let travelEvent = -1;
let travelAttempt = -1;
let travelTime = 0;
let lastUpdateMs = 0;
let travelLeftWasDown = false;
/** World z where the camera stops, and where the event sprite stands. */
let travelStopZ = 0;
let eventZ = 0;

interface OpenedLoot {
    at: number;
    reward: LootReward;
}
/** Container index -> when it was opened, and what it paid. */
const openedLoot = new Map<number, OpenedLoot>();

/** Combat layout with a first-person street in place of the enemy tank. */
export function updateTravel(): void {
    const state = getGameState();
    const now = performance.now();
    if (travelEvent !== state.gameDirector.eventIndex || travelAttempt !== directorAttempt()) {
        travelEvent = state.gameDirector.eventIndex;
        travelAttempt = directorAttempt();
        travelTime = 0;
        lastUpdateMs = now;
        travelLeftWasDown = isMouseButtonDown(0);
        openedLoot.clear();
        beginTravelStretch();
    }
    const dt = Math.min(0.05, Math.max(0, (now - lastUpdateMs) / 1000));
    lastUpdateMs = now;
    travelTime += dt;
    const stopZ = travelStopZ;
    setEngineBlend(driveSpeed(travelTime, stopZ) / DRIVE_SPEED);

    const viewWidth = GAME_WIDTH - ABILITY_BAR_WIDTH;
    const viewHeight = GAME_HEIGHT / 2;
    const cityView = { x: ABILITY_BAR_WIDTH, y: 0, width: viewWidth, height: viewHeight };
    const playerView = { x: ABILITY_BAR_WIDTH, y: viewHeight, width: viewWidth, height: viewHeight };
    const cameraZ = driveDistance(travelTime, stopZ);
    const stopped = cameraZ >= stopZ - 0.001;
    const nextEvent = getNextEventType();
    const camera: Camera3D = {
        position: { x: 0, y: CAMERA_HEIGHT, z: cameraZ },
        yaw: 0,
        pitch: -0.06,
        fov: Math.PI / 3,
    };
    const loot = streetLoot(travelEvent, STREET_HALF - 0.9, eventZ - 12);
    drawScene3D({
        viewport: cityView,
        background: SKY_BOTTOM,
        sky: { top: SKY_TOP, bottom: SKY_BOTTOM },
        camera,
        triangles: streetTriangles(cameraZ),
        billboards: [...trashBillboards(cameraZ), ...lootBillboards(cameraZ, loot), eventBillboard(cameraZ, nextEvent)],
        skySprite: travelSun(cityView),
    });
    drawLootPopups(camera, cityView, cameraZ, loot);
    drawText({
        text: "Travel",
        x: cityView.x + 24,
        y: cityView.y + 28,
        font: "20px sans-serif",
        color: "#d7d5cf",
        align: "left",
        baseline: "middle",
    });

    const vehicle = presentationVehicle(state.playerData.vehicle);
    drawCombatVehicle(vehicle, playerView, vehicle.base.name, false, vehicle.tiles.map(() => 0), 0, 0, cameraZ);
    drawRect({
        x: ABILITY_BAR_WIDTH,
        y: viewHeight - 1,
        width: viewWidth,
        height: 2,
        color: "#2e3546",
    });

    const guns = vehicle.tiles.filter((part) => part.tile.base.turret !== undefined);
    drawAbilityBar(guns, -1, guns.map(() => 0));
    drawViewEnergy(
        playerView,
        vehicle.power,
        getTotalPowerCapacity(vehicle.base),
        getPowerPerSecond(vehicle.base),
    );
    drawAbilityBarMoney(
        state.playerData.money,
        state.playerData.overclockModules,
        placedWeaponCount(state.playerData.vehicle),
        state.playerData.vehicleWeaponSlots,
    );

    const mouse = getMousePosition();
    const leftDown = isMouseButtonDown(0);
    const leftPressed = leftDown && !travelLeftWasDown;
    travelLeftWasDown = leftDown;
    const button = travelButtonBounds(cityView.x, cityView.width, viewHeight);
    const choices = explorationChoiceBounds(cityView.x, cityView.width, viewHeight);
    const onTravelButton = stopped && nextEvent !== "EXPLORATION" && hitsButton(button, mouse);
    const onChoice = stopped && nextEvent === "EXPLORATION" && (hitsButton(choices.explore, mouse) || hitsButton(choices.skip, mouse));
    if (leftPressed && !onTravelButton && !onChoice) {
        openLoot(mouse, camera, cityView, cameraZ, loot);
    }
    if (!stopped) {
        return;
    }
    if (nextEvent === "EXPLORATION") {
        drawExplorationChoice(cityView.x, cityView.width, viewHeight, leftPressed, mouse);
        return;
    }
    if (
        leftPressed
        && mouse.x >= button.x
        && mouse.y >= button.y
        && mouse.x < button.x + button.width
        && mouse.y < button.y + button.height
    ) {
        transitionToNextEvent();
        return;
    }
    drawRect({
        x: button.x,
        y: button.y,
        width: button.width,
        height: button.height,
        color: "#2f9e44",
    });
    drawText({
        text: travelButtonLabel(nextEvent),
        x: button.x + button.width / 2,
        y: button.y + button.height / 2,
        font: "22px sans-serif",
        color: "#f4fff6",
        align: "center",
        baseline: "middle",
    });
}

function explorationChoiceBounds(viewX: number, viewWidth: number, viewHeight: number): {
    explore: { x: number; y: number; width: number; height: number };
    skip: { x: number; y: number; width: number; height: number };
} {
    const height = 52;
    const width = 180;
    const y = viewHeight - 78;
    return {
        explore: { x: viewX + viewWidth / 2 - width - 8, y, width, height },
        skip: { x: viewX + viewWidth / 2 + 8, y, width, height },
    };
}

function drawExplorationChoice(
    viewX: number,
    viewWidth: number,
    viewHeight: number,
    leftPressed: boolean,
    mouse: { x: number; y: number },
): void {
    const { explore, skip } = explorationChoiceBounds(viewX, viewWidth, viewHeight);
    if (leftPressed && hitsButton(explore, mouse)) {
        chooseExploration("explore");
        return;
    }
    if (leftPressed && hitsButton(skip, mouse)) {
        chooseExploration("skip");
        return;
    }
    drawChoiceButton(explore, "Explore", "#2f9e44", "#f4fff6");
    drawChoiceButton(skip, "Skip", "#2a3040", "#eceae4");
}

function hitsButton(button: { x: number; y: number; width: number; height: number }, mouse: { x: number; y: number }): boolean {
    return mouse.x >= button.x
        && mouse.y >= button.y
        && mouse.x < button.x + button.width
        && mouse.y < button.y + button.height;
}

function drawChoiceButton(
    button: { x: number; y: number; width: number; height: number },
    label: string,
    color: string,
    textColor: string,
): void {
    drawRect({
        x: button.x,
        y: button.y,
        width: button.width,
        height: button.height,
        color,
    });
    drawText({
        text: label,
        x: button.x + button.width / 2,
        y: button.y + button.height / 2,
        font: "22px sans-serif",
        color: textColor,
        align: "center",
        baseline: "middle",
    });
}

function travelButtonBounds(viewX: number, viewWidth: number, viewHeight: number): { x: number; y: number; width: number; height: number } {
    const width = 180;
    const height = 52;
    return {
        x: viewX + viewWidth / 2 - width / 2,
        y: viewHeight - 78,
        width,
        height,
    };
}

function travelButtonLabel(next: EventType): string {
    if (next === "SHOP") {
        return "Shop";
    }
    if (next === "COMBAT") {
        return "Fight";
    }
    return "Continue";
}

/** Pick a 5–20 second drive and remember how many modules the player brought. */
function beginTravelStretch(): void {
    const seconds = TRAVEL_MIN_SECONDS + Math.random() * (TRAVEL_MAX_SECONDS - TRAVEL_MIN_SECONDS);
    travelStopZ = distanceForDriveSeconds(seconds);
    eventZ = travelStopZ + STOP_AHEAD;
}

/** Distance that the ramp-up, cruise, and ramp-down cover in `seconds`. */
function distanceForDriveSeconds(seconds: number): number {
    const cruise = Math.max(0, seconds - RAMP_TIME * 2);
    const rampDistance = DRIVE_SPEED * RAMP_TIME / 2;
    return rampDistance * 2 + DRIVE_SPEED * cruise;
}

/** Speed along the same ramp driveDistance integrates. */
function driveSpeed(elapsed: number, distance: number): number {
    const fullRamp = DRIVE_SPEED * RAMP_TIME / 2;
    const peak = distance < fullRamp * 2 ? distance / RAMP_TIME : DRIVE_SPEED;
    const rampDistance = peak * RAMP_TIME / 2;
    const cruiseTime = peak <= 0 ? 0 : Math.max(0, distance - rampDistance * 2) / peak;
    if (elapsed <= 0 || elapsed >= RAMP_TIME + cruiseTime + RAMP_TIME) {
        return 0;
    }
    if (elapsed < RAMP_TIME) {
        return peak * elapsed / RAMP_TIME;
    }
    if (elapsed < RAMP_TIME + cruiseTime) {
        return peak;
    }
    const decelTime = elapsed - RAMP_TIME - cruiseTime;
    return peak * (1 - decelTime / RAMP_TIME);
}

/** Speed up, hold DRIVE_SPEED, then slow to a stop exactly at `distance`. */
function driveDistance(elapsed: number, distance: number): number {
    const fullRamp = DRIVE_SPEED * RAMP_TIME / 2;
    const peak = distance < fullRamp * 2 ? distance / RAMP_TIME : DRIVE_SPEED;
    const rampDistance = peak * RAMP_TIME / 2;
    const cruiseTime = peak <= 0 ? 0 : Math.max(0, distance - rampDistance * 2) / peak;
    if (elapsed <= 0) {
        return 0;
    }
    if (elapsed < RAMP_TIME) {
        return peak * elapsed * elapsed / (2 * RAMP_TIME);
    }
    if (elapsed < RAMP_TIME + cruiseTime) {
        return rampDistance + peak * (elapsed - RAMP_TIME);
    }
    const decelTime = elapsed - RAMP_TIME - cruiseTime;
    if (decelTime >= RAMP_TIME) {
        return distance;
    }
    return distance - rampDistance + peak * decelTime * (1 - decelTime / (2 * RAMP_TIME));
}

function eventSprite(next: EventType): string {
    if (next === "SHOP") {
        return SHOP_EVENT_SPRITE;
    }
    if (next === "COMBAT") {
        return COMBAT_EVENT_SPRITE;
    }
    return EVENT_SPRITE;
}

const SUN_SPRITE = "world/textures/sun";
/** sun.png is 100×72. */
const SUN_SCALE = 3;
const SUN_WIDTH = 100 * SUN_SCALE;
const SUN_HEIGHT = 72 * SUN_SCALE;
/** Fraction down the travel view. The road paints over whatever reaches it. */
const SUN_Y = 0.22;

function travelSun(view: { x: number; y: number; width: number; height: number }): SkySprite {
    return {
        sprite: SUN_SPRITE,
        x: view.x + view.width / 2,
        y: view.y + view.height * SUN_Y,
        width: SUN_WIDTH,
        height: SUN_HEIGHT,
    };
}

function lootBillboards(cameraZ: number, loot: readonly StreetLoot[]): Billboard3D[] {
    const horizon = Math.sqrt(CAMERA_HEIGHT / STREET_CURVE);
    const billboards: Billboard3D[] = [];
    for (const piece of loot) {
        if (piece.z < cameraZ - 3 || piece.z > cameraZ + horizon * 1.35) {
            continue;
        }
        const opened = openedLoot.get(piece.index);
        const age = opened === undefined ? 0 : travelTime - opened.at;
        if (opened !== undefined && age >= LOOT_FADE_SECONDS) {
            continue;
        }
        billboards.push({
            position: bend({ x: piece.x, y: LOOT_HEIGHT / 2, z: piece.z }, cameraZ),
            width: LOOT_WIDTH,
            height: LOOT_HEIGHT,
            sprite: lootSprite(piece.kind, travelTime, piece.index),
            alpha: opened === undefined ? 1 : 1 - age / LOOT_FADE_SECONDS,
        });
    }
    return billboards;
}

function openLoot(
    mouse: { x: number; y: number },
    camera: Camera3D,
    viewport: { x: number; y: number; width: number; height: number },
    cameraZ: number,
    loot: readonly StreetLoot[],
): void {
    let best: StreetLoot | null = null;
    let bestDepth = Number.POSITIVE_INFINITY;
    const pad = 8;
    for (const piece of loot) {
        if (openedLoot.has(piece.index)) {
            continue;
        }
        const screen = projectBillboard(
            bend({ x: piece.x, y: LOOT_HEIGHT / 2, z: piece.z }, cameraZ),
            LOOT_WIDTH,
            LOOT_HEIGHT,
            camera,
            viewport,
        );
        if (!screen || screen.depth >= bestDepth) {
            continue;
        }
        if (
            mouse.x < screen.x - pad
            || mouse.y < screen.y - pad
            || mouse.x >= screen.x + screen.width + pad
            || mouse.y >= screen.y + screen.height + pad
        ) {
            continue;
        }
        best = piece;
        bestDepth = screen.depth;
    }
    if (!best) {
        return;
    }
    const state = getGameState();
    const modules = availableOverclockModules(state.playerData.overclockModules, state.playerData.vehicle.tiles);
    const reward = rollLootReward(modules, state.gameDirector.tier, Math.random());
    openedLoot.set(best.index, { at: travelTime, reward });
    playSound("misc/loot_opened");
    if (reward.kind === "money") {
        state.playerData.money += reward.amount;
    } else {
        state.playerData.overclockModules += reward.amount;
    }
}

function drawLootPopups(
    camera: Camera3D,
    viewport: { x: number; y: number; width: number; height: number },
    cameraZ: number,
    loot: readonly StreetLoot[],
): void {
    for (const piece of loot) {
        const opened = openedLoot.get(piece.index);
        if (opened === undefined) {
            continue;
        }
        const age = travelTime - opened.at;
        if (age >= LOOT_POPUP_SECONDS) {
            continue;
        }
        const screen = projectBillboard(
            bend({ x: piece.x, y: LOOT_HEIGHT / 2, z: piece.z }, cameraZ),
            LOOT_WIDTH,
            LOOT_HEIGHT,
            camera,
            viewport,
        );
        if (!screen) {
            continue;
        }
        const fade = age < 0.8 ? 1 : 1 - (age - 0.8) / (LOOT_POPUP_SECONDS - 0.8);
        drawLootPopup(screen.x + screen.width / 2, screen.y - 8 - age * 36, opened.reward, fade);
    }
}

function drawLootPopup(x: number, top: number, reward: LootReward, alpha: number): void {
    const font = "18px sans-serif";
    const label = lootLabel(reward);
    const textWidth = measureText(label, font);
    const icon = 34;
    const pad = 8;
    const gap = 8;
    const boxWidth = pad + icon + gap + textWidth + pad;
    const boxHeight = 42;
    const boxX = x - boxWidth / 2;
    const boxY = top - boxHeight;
    const shown = Math.max(0, Math.min(1, alpha));
    drawRect({
        x: boxX,
        y: boxY,
        width: boxWidth,
        height: boxHeight,
        color: `rgba(20, 24, 32, ${0.92 * shown})`,
        zIndex: 9,
    });
    drawSprite({
        sprite: lootIcon(reward),
        x: boxX + pad + icon / 2,
        y: boxY + boxHeight / 2,
        scaleX: 2,
        scaleY: 2,
        alpha: shown,
        zIndex: 9,
        foreground: true,
    });
    const textColor = reward.kind === "money"
        ? `rgba(230, 192, 123, ${shown})`
        : `rgba(142, 203, 255, ${shown})`;
    drawText({
        text: label,
        x: boxX + pad + icon + gap,
        y: boxY + boxHeight / 2,
        font,
        color: textColor,
        align: "left",
        baseline: "middle",
        zIndex: 9,
    });
}

/** Litter parked on the road. The same stretch keeps the same pieces as the camera drives past. */
function trashBillboards(cameraZ: number): Billboard3D[] {
    const horizon = Math.sqrt(CAMERA_HEIGHT / STREET_CURVE);
    const first = Math.floor((cameraZ - TRASH_SPACING) / TRASH_SPACING) - 1;
    const last = Math.ceil((cameraZ + horizon * 1.35) / TRASH_SPACING) + 1;
    const lane = STREET_HALF - 0.9;
    const billboards: Billboard3D[] = [];
    for (let index = first; index <= last; index++) {
        const seed = mixHash(index * 13 + travelEvent * 17 + 3);
        if (seed % 3 === 0) {
            continue;
        }
        const along = (mixHash(seed ^ 0x9e3779b1) % 1000) / 1000;
        const z = index * TRASH_SPACING + along * TRASH_SPACING * 0.7;
        if (z > eventZ - 12) {
            continue;
        }
        const across = ((seed >>> 8) % 1000) / 999;
        billboards.push({
            position: bend({ x: (across * 2 - 1) * lane, y: TRASH_HEIGHT / 2, z }, cameraZ),
            width: TRASH_WIDTH,
            height: TRASH_HEIGHT,
            sprite: TRASH_SPRITES[mixHash(seed ^ 0x85ebca6b) % TRASH_SPRITES.length],
        });
    }
    return billboards;
}

function eventBillboard(cameraZ: number, next: EventType): Billboard3D {
    return {
        position: bend({ x: 0, y: EVENT_CENTER_Y, z: eventZ }, cameraZ),
        width: EVENT_WIDTH,
        height: EVENT_HEIGHT,
        sprite: eventSprite(next),
    };
}

function presentationVehicle(vehicle: BaseVehicle): VehicleInstance {
    return {
        base: vehicle,
        tiles: vehicle.tiles.map((tile) => ({
            tile,
            health: tile.base.health,
            hitFlash: 0,
            healFlash: 0,
            fault: null,
            faultAge: 0,
        })),
        power: getTotalPowerCapacity(vehicle),
    };
}

function streetTriangles(cameraZ: number): Triangle3D[] {
    const triangles: Triangle3D[] = [];
    const horizon = Math.sqrt(CAMERA_HEIGHT / STREET_CURVE);
    const streetWidth = STREET_HALF * 2;
    const roadRepeat = streetWidth * (ROAD_TEX_HEIGHT / ROAD_TEX_WIDTH);
    const stripDepth = 1.6;
    const zStart = cameraZ + 0.4;
    const zEnd = cameraZ + horizon * 1.35;
    let z = zStart;
    while (z < zEnd) {
        const tileIndex = Math.floor(z / roadRepeat);
        const tileEnd = (tileIndex + 1) * roadRepeat;
        const next = Math.min(zEnd, tileEnd, z + stripDepth);
        if (next <= z) {
            break;
        }
        const depth = next - z;
        triangles.push(...planeTriangles(
            { x: 0, y: 0, z: z + depth / 2 },
            streetWidth,
            depth,
            "#3c4452",
            {
                sprite: ROAD_SPRITE,
                u0: 0,
                v0: z / roadRepeat - tileIndex,
                u1: 1,
                v1: next / roadRepeat - tileIndex,
            },
        ));
        z = next;
    }

    const first = Math.floor((cameraZ - BLOCK_DEPTH) / BLOCK_DEPTH);
    const last = Math.ceil((cameraZ + horizon * 3.5) / BLOCK_DEPTH);
    for (let index = first; index <= last; index++) {
        const blockZ = index * BLOCK_DEPTH + BLOCK_DEPTH / 2;
        pushBuilding(triangles, index * 13 + 7, -1, blockZ);
        pushBuilding(triangles, index * 13 + 19, 1, blockZ);
    }
    return bendTriangles(triangles, cameraZ);
}

/** Each row is one solid run of blocks. Depth matches the step, so neighboring faces meet. */
function pushBuilding(triangles: Triangle3D[], seed: number, side: number, z: number): void {
    const variety = Math.abs(seed);
    const height = 7 + (mixHash(seed) % 20) / 20 * 4;
    const thickness = 4.2 + (variety % 4) * 1.1;
    const sprite = BUILDING_SPRITES[mixHash(seed + 17) % BUILDING_SPRITES.length];
    triangles.push(...boxTriangles(
        { x: side * (STREET_HALF + thickness / 2), y: height / 2, z },
        { x: thickness, y: height, z: BLOCK_DEPTH },
        ROOF_COLOR,
        facade(sprite),
    ));
}

/** One facade across the street face. Taller blocks repeat downward from that top edge. */
function facade(sprite: string): FaceTexture {
    return {
        sprite,
        width: BLOCK_DEPTH,
        height: BLOCK_DEPTH * (BUILDING_TEX_HEIGHT / BUILDING_TEX_WIDTH),
    };
}

function mixHash(n: number): number {
    let h = Math.imul(n | 0, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA77);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
}

/** Drop the world by distance ahead of the camera, steep enough that far blocks sink past the horizon. */
function bendTriangles(triangles: Triangle3D[], cameraZ: number): Triangle3D[] {
    return triangles.map((triangle) => ({
        ...triangle,
        a: bend(triangle.a, cameraZ),
        b: bend(triangle.b, cameraZ),
        c: bend(triangle.c, cameraZ),
    }));
}

function bend(point: Vec3, cameraZ: number): Vec3 {
    const ahead = point.z - cameraZ;
    return { x: point.x, y: point.y - STREET_CURVE * ahead * ahead, z: point.z };
}
