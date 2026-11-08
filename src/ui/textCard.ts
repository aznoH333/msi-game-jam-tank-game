import { playSound } from "../audio/audio";
import { ABILITY_BAR_WIDTH } from "../combat/constants";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, setDrawClip, strokeRect } from "../drawing/canvas";
import { drawText, measureText } from "../drawing/text";
import { isKeyDown } from "../input/input";
import { DETAILS_SIDEBAR_WIDTH } from "./vehicleDetailsSidebar";
import { dialogCatalog } from "./dialogCatalog";

export type CardType = "NORMAL" | "BLOCKING" | "TUTORIAL";

export interface TextCard {
    type: CardType;
    text: string;
    specialIdentifier?: string;
}

export interface DialogChain {
    dialogIdentifier: string;
    cards: TextCard[];
}

export const CHARS_PER_SECOND = 60;
const TALK_SOUND = "misc/talking";
const NORMAL_HOLD_SECONDS = 3;
const TALK_FRAME_SECONDS = 0.1;
const BOX_MARGIN = 16;
const TEXT_PAD = 28;
const TEXT_FONT = "28px sans-serif";
const TEXT_LINE = 40;
const PROMPT_FONT = "18px sans-serif";
/** Matches the driver portrait slot in the ability bar. */
const PORTRAIT_SIZE = ABILITY_BAR_WIDTH - 32;
const PORTRAIT_Y = GAME_HEIGHT - 72 - 64 - 12 - PORTRAIT_SIZE;

interface ActiveDialog {
    chain: DialogChain;
    index: number;
    /** Characters revealed so far. Fractional so the rate stays smooth. */
    shown: number;
    /** Seconds timestamp when the full text finished appearing. */
    finishedAt: number | null;
}

let active: ActiveDialog | null = null;
let spaceWasDown = false;
let lastMs = 0;
let firstCombatTutorialDone = false;
let overclockTutorialDone = false;
let trashTutorialDone = false;
let trashTutorialQueued = false;
let trackedTutorial = "";
let placedGenerator = false;
let placedBattery = false;

export type ShopAction = "camera" | "name" | "go" | "erase" | "copy" | "tab" | "place" | "buy" | "overclock";

export function startDialogChain(dialogIdentifier: string): void {
    const chain = dialogCatalog.find((entry) => entry.dialogIdentifier === dialogIdentifier);
    if (!chain || chain.cards.length === 0) {
        return;
    }
    active = { chain, index: 0, shown: 0, finishedAt: null };
}

/** Advance when the current card is a tutorial and its trigger has happened. */
export function continueWithTutorialCard(): void {
    const card = getCurrentDialogCard();
    if (!card || card.type !== "TUTORIAL") {
        return;
    }
    advanceCard();
}

export function getCurrentDialogCard(): TextCard | null {
    if (!active) {
        return null;
    }
    return active.chain.cards[active.index] ?? null;
}

export function activeDialogId(): string | null {
    return active?.chain.dialogIdentifier ?? null;
}

export function stopDialog(): void {
    active = null;
}

/** A new run should see the tutorials again. */
export function resetTutorialProgress(): void {
    firstCombatTutorialDone = false;
    overclockTutorialDone = false;
    trashTutorialDone = false;
    trashTutorialQueued = false;
}

/**
 * Shop after the intro boss. Starts once.
 * Returns the module count, with one module added when the player is holding none.
 */
export function startOverclockTutorial(modulesOwned: number): number {
    if (overclockTutorialDone || active) {
        return modulesOwned;
    }
    const modules = modulesOwned < 1 ? 1 : modulesOwned;
    startDialogChain("overclock_tutorial");
    return modules;
}

/** Show the trash line after the road is on screen, not during the shop fade. */
export function queueTrashTutorial(): void {
    if (trashTutorialDone || trashTutorialQueued || active) {
        return;
    }
    trashTutorialQueued = true;
}

/** Starts the queued trash line. Call only once the screen transition is idle. */
export function playQueuedTrashTutorial(): void {
    if (!trashTutorialQueued || active) {
        return;
    }
    trashTutorialQueued = false;
    trashTutorialDone = true;
    startDialogChain("trash_tutorial");
}

/** Starts the combat tutorial once per run, on the first fight only. */
export function startFirstCombatTutorial(): void {
    if (firstCombatTutorialDone || active?.chain.dialogIdentifier === "combat_tutorial") {
        return;
    }
    startDialogChain("combat_tutorial");
}

/** Blocking cards freeze the shop and the player's shots. */
export function dialogBlocksPlayer(): boolean {
    return getCurrentDialogCard()?.type === "BLOCKING";
}

/**
 * Shop clicks allowed by the current card.
 * `detail` is the tab name or the tile type being placed.
 */
export function shopActionAllowed(action: ShopAction, detail = ""): boolean {
    const card = getCurrentDialogCard();
    if (!card || card.type === "NORMAL") {
        return true;
    }
    if (card.type !== "TUTORIAL") {
        return false;
    }
    if (card.specialIdentifier === "gun_place_tutorial") {
        return (action === "tab" && detail === "WEAPON") || (action === "place" && detail === "WEAPON");
    }
    if (card.specialIdentifier === "power_place_tutorial") {
        return (action === "tab" && detail === "UTILITY") || (action === "place" && detail === "UTILITY");
    }
    if (card.specialIdentifier === "go_tutorial") {
        return action === "go";
    }
    if (card.specialIdentifier === "overclock_place_tutorial") {
        return (action === "tab" && detail === "OVERCLOCK") || action === "overclock";
    }
    return false;
}

/** Tutorial placements have to join the vehicle, so GO cannot be soft-locked later. */
export function tutorialPlacementMustAttach(): boolean {
    const id = getCurrentDialogCard()?.specialIdentifier;
    return id === "gun_place_tutorial" || id === "power_place_tutorial";
}

/** A tile landed. Gun and power tutorials advance when their step is done. */
export function notifyTutorialPlacement(tile: { type: string; powerGenerationPerSecond?: number; powerCapacity?: number }): void {
    const id = getCurrentDialogCard()?.specialIdentifier;
    if (id === "gun_place_tutorial" && tile.type === "WEAPON") {
        continueWithTutorialCard();
        return;
    }
    if (id !== "power_place_tutorial") {
        return;
    }
    if ((tile.powerGenerationPerSecond ?? 0) > 0) {
        placedGenerator = true;
    }
    if ((tile.powerCapacity ?? 0) > 0) {
        placedBattery = true;
    }
    if (placedGenerator && placedBattery) {
        continueWithTutorialCard();
    }
}

/** Combat tutorial: only the first gun (the 1 key) can be selected. */
export function combatGunSelectAllowed(index: number): boolean {
    const card = getCurrentDialogCard();
    if (!card || card.type === "NORMAL") {
        return true;
    }
    if (card.type === "BLOCKING") {
        return false;
    }
    return card.specialIdentifier === "shooting_tutorial_1" && index === 0;
}

/** The overclock tutorial ends its action card once a module is installed. */
export function notifyOverclockInstalled(): void {
    if (getCurrentDialogCard()?.specialIdentifier === "overclock_place_tutorial") {
        continueWithTutorialCard();
    }
}

/** The shooting tutorial ends once a shot actually leaves the gun. */
export function notifyPlayerFired(): void {
    if (getCurrentDialogCard()?.specialIdentifier === "shooting_tutorial_1") {
        continueWithTutorialCard();
    }
}

/** Combat tutorial: firing is allowed, repair is not. */
export function combatActionAllowed(action: "fire" | "repair"): boolean {
    const card = getCurrentDialogCard();
    if (!card || card.type === "NORMAL") {
        return true;
    }
    if (card.type === "BLOCKING") {
        return false;
    }
    return card.specialIdentifier === "shooting_tutorial_1" && action === "fire";
}

/** Blocking and tutorial cards freeze enemy actions. */
export function dialogBlocksEnemies(): boolean {
    const type = getCurrentDialogCard()?.type;
    return type === "BLOCKING" || type === "TUTORIAL";
}

/** True while card text is still appearing, so the portrait can talk. */
export function driverIsTalking(): boolean {
    const card = getCurrentDialogCard();
    if (!card || !active) {
        return false;
    }
    return active.shown < card.text.length;
}

/** Idle on even frames, talking on odd frames, while a line is being typed out. */
export function driverTalkingMouthOpen(): boolean {
    return Math.floor(performance.now() / 1000 / TALK_FRAME_SECONDS) % 2 === 1;
}

/** Reveal text, dismiss finished cards, and draw the current one. */
export function updateDialog(): void {
    const nowMs = performance.now();
    const dt = lastMs === 0 ? 0 : Math.min(0.05, Math.max(0, (nowMs - lastMs) / 1000));
    lastMs = nowMs;
    const now = nowMs / 1000;
    const spaceDown = isKeyDown("Space");
    const spacePressed = spaceDown && !spaceWasDown;
    spaceWasDown = spaceDown;

    const card = getCurrentDialogCard();
    if (!card || !active) {
        return;
    }
    const tutorialId = card.specialIdentifier ?? "";
    if (tutorialId !== trackedTutorial) {
        trackedTutorial = tutorialId;
        placedGenerator = false;
        placedBattery = false;
    }
    if (card.text.length === 0 && active.finishedAt === null) {
        active.finishedAt = now;
    }
    if (active.shown < card.text.length) {
        const revealedBefore = Math.floor(active.shown);
        active.shown = Math.min(card.text.length, active.shown + dt * CHARS_PER_SECOND);
        const revealedAfter = Math.floor(active.shown);
        for (let index = revealedBefore; index < revealedAfter; index++) {
            if (card.text[index] !== " ") {
                playSound(TALK_SOUND);
            }
        }
        if (active.shown >= card.text.length) {
            active.finishedAt = now;
        }
    } else if (card.type === "NORMAL" && active.finishedAt !== null && now - active.finishedAt >= NORMAL_HOLD_SECONDS) {
        advanceCard();
    } else if (card.type === "BLOCKING" && spacePressed) {
        advanceCard();
    }
    drawDialog(getCurrentDialogCard());
}

function advanceCard(): void {
    if (!active) {
        return;
    }
    const chainId = active.chain.dialogIdentifier;
    active.index += 1;
    active.shown = 0;
    active.finishedAt = null;
    if (active.index >= active.chain.cards.length) {
        if (chainId === "combat_tutorial") {
            firstCombatTutorialDone = true;
        }
        if (chainId === "overclock_tutorial") {
            overclockTutorialDone = true;
        }
        active = null;
    }
}

function drawDialog(card: TextCard | null): void {
    if (!card || !active) {
        return;
    }
    const x = ABILITY_BAR_WIDTH + BOX_MARGIN;
    const width = GAME_WIDTH - DETAILS_SIDEBAR_WIDTH - BOX_MARGIN - x;
    const y = PORTRAIT_Y;
    setDrawClip(null);
    drawRect({
        x,
        y,
        width,
        height: PORTRAIT_SIZE,
        color: "#1b1f2a",
        zIndex: 9,
    });
    strokeRect({
        x: x + 1,
        y: y + 1,
        width: width - 2,
        height: PORTRAIT_SIZE - 2,
        color: "#e6c07b",
        lineWidth: 2,
        zIndex: 9,
    });
    const revealed = card.text.slice(0, Math.floor(active.shown));
    const lines = wrapText(revealed, TEXT_FONT, width - TEXT_PAD * 2);
    let lineY = y + TEXT_PAD;
    for (const line of lines) {
        if (lineY > y + PORTRAIT_SIZE - TEXT_PAD - TEXT_LINE) {
            break;
        }
        drawText({
            text: line,
            x: x + TEXT_PAD,
            y: lineY,
            font: TEXT_FONT,
            color: "#eceae4",
            align: "left",
            baseline: "top",
            zIndex: 9,
        });
        lineY += TEXT_LINE;
    }
    if (card.type === "BLOCKING" && active.shown >= card.text.length) {
        drawText({
            text: "press space to continue",
            x: x + width - TEXT_PAD,
            y: y + PORTRAIT_SIZE - TEXT_PAD,
            font: PROMPT_FONT,
            color: "#e6c07b",
            align: "right",
            baseline: "bottom",
            zIndex: 9,
        });
    }
}

function wrapText(text: string, font: string, maxWidth: number): string[] {
    if (text.length === 0) {
        return [];
    }
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const next = line.length === 0 ? word : `${line} ${word}`;
        if (measureText(next, font) <= maxWidth) {
            line = next;
            continue;
        }
        if (line.length > 0) {
            lines.push(line);
        }
        line = word;
    }
    if (line.length > 0) {
        lines.push(line);
    }
    return lines;
}
