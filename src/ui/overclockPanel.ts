import { adjustOverclock, getOverclockedTurretStats, type TurretCombatStats } from "../building/vehicleUtils";
import type { PlacedTile } from "../building/types/tiles";
import { driverPortraitFrame } from "../combat/abilityBar";
import { drawRect, getDrawClip, setDrawClip, strokeRect } from "../drawing/canvas";
import { drawText, measureText } from "../drawing/text";
import { SIDEBAR_CONTENT_TOP, SIDEBAR_WIDTH, type Bounds } from "./buildingSidebar";

const PADDING = 16;
const EFFECT_FIELDS: {
    key: "damage" | "powerCost" | "salvo" | "salvoDelay" | "accuracy" | "reloadTime" | "explosionRadius" | "jamChance" | "failChance";
    stat: keyof TurretCombatStats;
    label: string;
}[] = [
    { key: "damage", stat: "damagePerShot", label: "Damage" },
    { key: "powerCost", stat: "powerPerShot", label: "Power per shot" },
    { key: "salvo", stat: "salvoCount", label: "Salvo count" },
    { key: "salvoDelay", stat: "salvoDelay", label: "Salvo delay" },
    { key: "accuracy", stat: "accuracy", label: "Accuracy" },
    { key: "reloadTime", stat: "reloadTime", label: "Reload time" },
    { key: "explosionRadius", stat: "explosionRadius", label: "Explosion radius" },
    { key: "jamChance", stat: "jamChance", label: "Jam chance" },
    { key: "failChance", stat: "failChance", label: "Fail chance" },
];

const CARD_INSET = 8;
const CARD_PAD_X = 12;
const CARD_PAD_Y = 12;
const CARD_GAP = 12;
const NAME_BLOCK = 32;
const COST_BLOCK = 24;
const NAME_FONT = "22px sans-serif";
const COST_FONT = "16px sans-serif";
const VALUE_FONT = "18px sans-serif";
const STAT_FONT = "16px sans-serif";
const BUTTON_SIZE = 30;
const BUTTON_GAP = 8;
const EFFECT_ROW = 24;
const CHANCE_ROW = 30;
const CHANCE_FONT = "20px sans-serif";
const CHANCE_COLOR = "#ff9a3c";
const CARD_FILL = "#141820";
const CARD_EDGE = "#4a5568";
const SCROLL_GUTTER = 16;
const SCROLL_TRACK = "#2a3040";
const SCROLL_THUMB = "#8b919c";
const LIST_GAP = 12;

let scrollY = 0;
let trackedTile: PlacedTile | null = null;
let draggingScroll = false;
let dragOriginY = 0;
let dragOriginScroll = 0;

/** The list stops above the driver portrait. */
function listView(): Bounds {
    const top = SIDEBAR_CONTENT_TOP;
    const bottom = driverPortraitFrame().y - LIST_GAP;
    return { x: 0, y: top, width: SIDEBAR_WIDTH, height: Math.max(0, bottom - top) };
}

function pointIn(bounds: Bounds, x: number, y: number): boolean {
    return x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height;
}

export interface OverclockCard {
    index: number;
    card: Bounds;
    track: Bounds;
    minus: Bounds;
    plus: Bounds;
}

function drawStepButton(bounds: Bounds, label: string, enabled: boolean): void {
    drawRect({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color: enabled ? (label === "+" ? "#2f9e44" : "#343c50") : "#2a3040",
    });
    drawText({
        text: label,
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        font: "20px sans-serif",
        color: enabled ? "#f4fff6" : "#6d7380",
        align: "center",
        baseline: "middle",
    });
}

function formatStat(value: number): string {
    return String(Math.round(value * 1000) / 1000);
}

function moduleCostLabel(stepCost: number): string {
    if (stepCost <= 0) {
        return "Free";
    }
    return stepCost === 1 ? "1 module" : `${stepCost} modules`;
}

/** 0.03 displays as 3%. */
function formatChance(chance: number): string {
    return `${Math.round(chance * 1000) / 10}%`;
}

function placeCards(placed: PlacedTile, scroll: number, gutter: number): OverclockCard[] {
    const cards: OverclockCard[] = [];
    const innerLeft = CARD_INSET + CARD_PAD_X;
    const innerRight = SIDEBAR_WIDTH - CARD_INSET - CARD_PAD_X - gutter;
    let y = SIDEBAR_CONTENT_TOP - scroll;
    for (let index = 0; index < placed.overclocks.length; index++) {
        const slider = placed.overclocks[index].base;
        const cardY = y;
        const buttonY = cardY + CARD_PAD_Y + NAME_BLOCK + COST_BLOCK;
        const minus = { x: innerLeft, y: buttonY, width: BUTTON_SIZE, height: BUTTON_SIZE };
        const plus = {
            x: innerRight - BUTTON_SIZE,
            y: buttonY,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
        };
        const track = {
            x: minus.x + BUTTON_SIZE + BUTTON_GAP,
            y: buttonY + (BUTTON_SIZE - 18) / 2,
            width: plus.x - BUTTON_GAP - (minus.x + BUTTON_SIZE + BUTTON_GAP),
            height: 18,
        };
        let body = buttonY + BUTTON_SIZE + 12;
        for (const field of EFFECT_FIELDS) {
            if (slider[field.key] !== undefined) {
                body += field.key === "jamChance" || field.key === "failChance" ? CHANCE_ROW : EFFECT_ROW;
            }
        }
        const card = {
            x: CARD_INSET,
            y: cardY,
            width: SIDEBAR_WIDTH - CARD_INSET * 2 - gutter,
            height: body + CARD_PAD_Y - cardY,
        };
        y = card.y + card.height + CARD_GAP;
        cards.push({ index, card, track, minus, plus });
    }
    return cards;
}

function contentHeight(cards: readonly OverclockCard[], scroll: number): number {
    const last = cards[cards.length - 1];
    if (!last) {
        return 0;
    }
    return last.card.y + last.card.height - (SIDEBAR_CONTENT_TOP - scroll);
}

function maxScroll(placed: PlacedTile | null): number {
    if (!placed?.base.turret) {
        return 0;
    }
    const height = contentHeight(placeCards(placed, 0, 0), 0);
    return Math.max(0, height - listView().height);
}

function scrollBar(view: Bounds, limit: number): { track: Bounds; thumb: Bounds } | null {
    if (limit <= 0) {
        return null;
    }
    const track = {
        x: SIDEBAR_WIDTH - 12,
        y: view.y + 4,
        width: 6,
        height: Math.max(0, view.height - 8),
    };
    const content = limit + view.height;
    const thumbHeight = Math.max(28, track.height * (view.height / content));
    const travel = Math.max(0, track.height - thumbHeight);
    return {
        track,
        thumb: {
            x: track.x,
            y: track.y + (limit === 0 ? 0 : (scrollY / limit) * travel),
            width: track.width,
            height: Math.min(thumbHeight, track.height),
        },
    };
}

/** Wheel and thumb drag. Call before laying the cards out for a click. */
export function updateOverclockScroll(
    placed: PlacedTile | null,
    mouse: { x: number; y: number },
    wheel: number,
    leftDown: boolean,
    leftPressed: boolean,
): void {
    if (placed !== trackedTile) {
        trackedTile = placed;
        scrollY = 0;
        draggingScroll = false;
    }
    const limit = maxScroll(placed);
    if (limit <= 0) {
        scrollY = 0;
        draggingScroll = false;
        return;
    }
    const view = listView();
    const bar = scrollBar(view, limit);
    const overView = pointIn(view, mouse.x, mouse.y);
    if (overView && wheel !== 0 && !draggingScroll) {
        scrollY = Math.min(limit, Math.max(0, scrollY + wheel));
    }
    if (leftPressed && bar && pointIn(bar.thumb, mouse.x, mouse.y)) {
        draggingScroll = true;
        dragOriginY = mouse.y;
        dragOriginScroll = scrollY;
    } else if (leftPressed && bar && pointIn(bar.track, mouse.x, mouse.y)) {
        scrollY = Math.min(limit, Math.max(0, mouse.y < bar.thumb.y ? scrollY - view.height : scrollY + view.height));
    }
    if (draggingScroll && leftDown && bar) {
        const travel = bar.track.height - bar.thumb.height;
        const dy = mouse.y - dragOriginY;
        scrollY = travel <= 0 ? 0 : Math.min(limit, Math.max(0, dragOriginScroll + (dy / travel) * limit));
    }
    if (!leftDown) {
        draggingScroll = false;
    }
    scrollY = Math.min(limit, Math.max(0, scrollY));
}

/** True when the pointer is on the scrollbar, so a card button underneath is not clicked. */
export function overclockScrollbarContains(mouse: { x: number; y: number }, placed: PlacedTile | null): boolean {
    const bar = scrollBar(listView(), maxScroll(placed));
    return bar !== null && pointIn(bar.track, mouse.x, mouse.y);
}

/** A plus or minus that is fully inside the list, not clipped off against the portrait. */
export function overclockControlVisible(bounds: Bounds): boolean {
    const view = listView();
    return bounds.y >= view.y && bounds.y + bounds.height <= view.y + view.height;
}

export function layoutOverclockCards(placed: PlacedTile | null): OverclockCard[] {
    if (!placed?.base.turret) {
        return [];
    }
    const limit = maxScroll(placed);
    scrollY = Math.min(limit, Math.max(0, scrollY));
    return placeCards(placed, scrollY, limit > 0 ? SCROLL_GUTTER : 0);
}

export function drawOverclockPanel(placed: PlacedTile | null, modules: number): void {
    if (!placed?.base.turret) {
        drawText({
            text: "Select a placed turret",
            x: PADDING,
            y: SIDEBAR_CONTENT_TOP,
            font: "18px sans-serif",
            color: "#d7d5cf",
            align: "left",
            baseline: "top",
        });
        return;
    }

    const turret = placed.base.turret;
    const view = listView();
    const cards = layoutOverclockCards(placed);
    const previousClip = getDrawClip();
    setDrawClip(view);
    for (const card of cards) {
        const instance = placed.overclocks[card.index];
        const adjusted = getOverclockedTurretStats(turret, [instance]);
        const innerLeft = card.card.x + CARD_PAD_X;
        const innerRight = card.card.x + card.card.width - CARD_PAD_X;
        const nameY = card.card.y + CARD_PAD_Y;
        const costY = nameY + NAME_BLOCK;

        drawRect({
            x: card.card.x,
            y: card.card.y,
            width: card.card.width,
            height: card.card.height,
            color: CARD_FILL,
        });
        strokeRect({
            x: card.card.x + 0.5,
            y: card.card.y + 0.5,
            width: card.card.width - 1,
            height: card.card.height - 1,
            color: CARD_EDGE,
        });
        drawRect({
            x: card.card.x,
            y: card.card.y,
            width: 4,
            height: card.card.height,
            color: "#e6c07b",
        });

        drawText({
            text: instance.base.name,
            x: innerLeft,
            y: nameY,
            font: NAME_FONT,
            color: "#ffffff",
            align: "left",
            baseline: "top",
        });
        drawText({
            text: moduleCostLabel(instance.base.stepCost),
            x: innerLeft,
            y: costY,
            font: COST_FONT,
            color: "#8ecbff",
            align: "left",
            baseline: "top",
        });
        drawText({
            text: formatStat(instance.value),
            x: innerRight,
            y: costY,
            font: VALUE_FONT,
            color: "#ffffff",
            align: "right",
            baseline: "top",
        });

        // slider track and the allocated-point knob
        drawRect({
            x: card.track.x,
            y: card.track.y,
            width: card.track.width,
            height: card.track.height,
            color: "#2a3040",
        });
        const span = instance.base.maxValue - instance.base.minValue;
        const amount = span === 0 ? 0 : (instance.value - instance.base.minValue) / span;
        const knobX = card.track.x + amount * card.track.width;
        drawRect({
            x: card.track.x,
            y: card.track.y,
            width: Math.max(0, knobX - card.track.x),
            height: card.track.height,
            color: "#3d465c",
        });
        drawRect({
            x: knobX - 4,
            y: card.track.y - 2,
            width: 8,
            height: card.track.height + 4,
            color: "#e6c07b",
        });
        drawStepButton(card.minus, "-", adjustOverclock(instance, -1, modules) !== null);
        drawStepButton(card.plus, "+", adjustOverclock(instance, 1, modules) !== null);

        // this slider's stat effects: base value, then the overclocked value
        let effectY = card.minus.y + card.minus.height + 12;
        for (const field of EFFECT_FIELDS) {
            if (instance.base[field.key] === undefined) {
                continue;
            }
            const chance = field.stat === "jamChance" || field.stat === "failChance";
            const valueFont = chance ? CHANCE_FONT : STAT_FONT;
            let baseText: string;
            let nextText: string;
            if (field.stat === "jamChance" || field.stat === "failChance") {
                baseText = formatChance(0);
                nextText = formatChance(adjusted[field.stat]);
            } else {
                baseText = formatStat(turret[field.stat]);
                nextText = formatStat(adjusted[field.stat]);
            }
            const nextColor = chance ? CHANCE_COLOR : nextText === baseText ? "#ffffff" : "#e6c07b";
            const arrow = " -> ";
            const nextX = innerRight - measureText(nextText, valueFont);
            const arrowX = nextX - measureText(arrow, valueFont);
            const baseX = arrowX - measureText(baseText, valueFont);
            drawText({
                text: field.label,
                x: innerLeft,
                y: effectY,
                font: valueFont,
                color: chance ? CHANCE_COLOR : "#d7d5cf",
                align: "left",
                baseline: "top",
            });
            drawText({
                text: baseText,
                x: baseX,
                y: effectY,
                font: valueFont,
                color: chance ? CHANCE_COLOR : "#ffffff",
                align: "left",
                baseline: "top",
            });
            drawText({
                text: arrow,
                x: arrowX,
                y: effectY,
                font: valueFont,
                color: chance ? CHANCE_COLOR : "#d7d5cf",
                align: "left",
                baseline: "top",
            });
            drawText({
                text: nextText,
                x: nextX,
                y: effectY,
                font: valueFont,
                color: nextColor,
                align: "left",
                baseline: "top",
            });
            effectY += chance ? CHANCE_ROW : EFFECT_ROW;
        }
    }
    const bar = scrollBar(view, maxScroll(placed));
    if (bar) {
        drawRect({ ...bar.track, color: SCROLL_TRACK });
        drawRect({ ...bar.thumb, color: SCROLL_THUMB });
    }
    setDrawClip(previousClip);
}
