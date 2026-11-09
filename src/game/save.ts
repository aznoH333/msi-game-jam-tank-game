import { serializeVehicle, vehicleFromSave, type SavedVehicle } from "../building/vehicleSave";
import type { GameDirector } from "../gamedirector/gamedirector";
import type { PlayerData } from "./playerData";

const SAVE_KEY = "armored-exodus";

const SAVED_SCREENS = [
    "BUILDING_SCREEN",
    "COMBAT_SCREEN",
    "EXPLORATION_SCREEN",
    "GAME_OVER_SCREEN",
    "OUTRO_SCREEN",
] as const;

export type SavedScreen = (typeof SAVED_SCREENS)[number];

export interface SavedTutorials {
    firstCombatTutorialDone: boolean;
    overclockTutorialDone: boolean;
    trashTutorialDone: boolean;
    trashTutorialQueued: boolean;
}

interface SavedPlayer {
    vehicle: SavedVehicle;
    money: number;
    overclockModules: number;
    weapons: PlayerData["weapons"];
    personHealth: number;
    vehicleWeaponSlots: number;
    difficulty: PlayerData["difficulty"];
    unlockedTiles: string[];
}

export interface SavedRun {
    player: SavedPlayer;
    director: GameDirector;
    screen: SavedScreen;
    tutorials: SavedTutorials;
}

export interface LoadedRun {
    player: PlayerData;
    director: GameDirector;
    screen: SavedScreen;
    tutorials: SavedTutorials;
}

const EVENT_TYPES = ["SHOP", "TRAVEL", "COMBAT", "EXPLORATION"];

/** True when this screen is part of a run that should survive a reload. */
export function isSavedScreen(screen: string): screen is SavedScreen {
    return (SAVED_SCREENS as readonly string[]).includes(screen);
}

/** Write the current run. Menu and intro screens are left out so Play can resume the run. */
export function writeSavedRun(player: PlayerData, director: GameDirector, screen: string, tutorials: SavedTutorials): void {
    if (!isSavedScreen(screen)) {
        return;
    }
    const store = browserStorage();
    if (!store) {
        return;
    }
    try {
        store.setItem(SAVE_KEY, JSON.stringify(toSavedRun(player, director, screen, tutorials)));
    } catch {
        // A full or blocked store should not stop the run.
    }
}

/** The run Play should resume, or null when nothing is stored. */
export function loadSavedRun(): LoadedRun | null {
    const store = browserStorage();
    if (!store) {
        return null;
    }
    try {
        const raw = store.getItem(SAVE_KEY);
        if (!raw) {
            return null;
        }
        return fromSavedRun(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function hasSavedRun(): boolean {
    return loadSavedRun() !== null;
}

/** Forget the stored run. */
export function clearSavedRun(): void {
    const store = browserStorage();
    if (!store) {
        return;
    }
    try {
        store.removeItem(SAVE_KEY);
    } catch {
        // Already gone.
    }
}

export function toSavedRun(player: PlayerData, director: GameDirector, screen: SavedScreen, tutorials: SavedTutorials): SavedRun {
    return {
        player: {
            vehicle: serializeVehicle(player.vehicle),
            money: player.money,
            overclockModules: player.overclockModules,
            weapons: player.weapons,
            personHealth: player.personHealth,
            vehicleWeaponSlots: player.vehicleWeaponSlots,
            difficulty: player.difficulty,
            unlockedTiles: player.unlockedTiles.slice(),
        },
        director: {
            eventIndex: director.eventIndex,
            lastCheckPoint: director.lastCheckPoint,
            currentEventType: director.currentEventType,
            tier: director.tier,
            combatsThisTier: director.combatsThisTier,
            fightsSinceShop: director.fightsSinceShop,
            shopEvery: director.shopEvery,
            bossShopPending: director.bossShopPending,
            finalBossShopDone: director.finalBossShopDone,
            lastEnemyFile: director.lastEnemyFile,
        },
        screen,
        tutorials: { ...tutorials },
    };
}

export function fromSavedRun(value: unknown): LoadedRun | null {
    if (!isRecord(value)) {
        return null;
    }
    const screen = value.screen;
    const director = value.director;
    const tutorials = value.tutorials;
    const player = value.player;
    if (typeof screen !== "string" || !isSavedScreen(screen) || !isDirector(director) || !isTutorials(tutorials) || !isRecord(player)) {
        return null;
    }
    if (!isRecord(player.vehicle) || typeof player.vehicle.name !== "string" || !Array.isArray(player.vehicle.tiles)) {
        return null;
    }
    if (
        typeof player.money !== "number"
        || typeof player.overclockModules !== "number"
        || typeof player.personHealth !== "number"
        || typeof player.vehicleWeaponSlots !== "number"
        || !Array.isArray(player.unlockedTiles)
        || !player.unlockedTiles.every((name) => typeof name === "string")
        || !isRecord(player.weapons)
        || !Object.values(player.weapons).every((amount) => typeof amount === "number")
    ) {
        return null;
    }
    try {
        return {
            player: {
                vehicle: vehicleFromSave(player.vehicle as unknown as SavedVehicle),
                money: player.money,
                overclockModules: player.overclockModules,
                weapons: player.weapons as PlayerData["weapons"],
                personHealth: player.personHealth,
                vehicleWeaponSlots: player.vehicleWeaponSlots,
                difficulty: player.difficulty === "normal" ? "normal" : "hard",
                unlockedTiles: player.unlockedTiles.slice(),
            },
            director,
            screen,
            tutorials,
        };
    } catch {
        return null;
    }
}

function isDirector(value: unknown): value is GameDirector {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.eventIndex === "number"
        && typeof value.lastCheckPoint === "number"
        && typeof value.currentEventType === "string"
        && EVENT_TYPES.includes(value.currentEventType)
        && typeof value.tier === "number"
        && typeof value.combatsThisTier === "number"
        && typeof value.fightsSinceShop === "number"
        && typeof value.shopEvery === "number"
        && typeof value.bossShopPending === "boolean"
        && typeof value.finalBossShopDone === "boolean"
        && (value.lastEnemyFile === null || typeof value.lastEnemyFile === "string");
}

function isTutorials(value: unknown): value is SavedTutorials {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.firstCombatTutorialDone === "boolean"
        && typeof value.overclockTutorialDone === "boolean"
        && typeof value.trashTutorialDone === "boolean"
        && typeof value.trashTutorialQueued === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function browserStorage(): Storage | null {
    try {
        if (typeof localStorage === "undefined") {
            return null;
        }
        return localStorage;
    } catch {
        return null;
    }
}
