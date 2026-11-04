import { adjustOverclock, getOverclockedTurretStats, type TurretCombatStats } from "../building/vehicleUtils";
import type { PlacedTile } from "../building/types/tiles";
import { drawRect } from "../drawing/canvas";
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

const BUTTON_SIZE = 28;
const BUTTON_GAP = 8;
const EFFECT_ROW = 22;
const CHANCE_ROW = 34;
const CHANCE_FONT = "22px sans-serif";
const CHANCE_COLOR = "#ff8c1a";

export interface OverclockCard {
    index: number;
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

/** 0.03 displays as 3%. */
function formatChance(chance: number): string {
    return `${Math.round(chance * 1000) / 10}%`;
}

export function layoutOverclockCards(placed: PlacedTile | null): OverclockCard[] {
    if (!placed?.base.turret) {
        return [];
    }

    const cards: OverclockCard[] = [];
    let y = SIDEBAR_CONTENT_TOP;
    for (let index = 0; index < placed.overclocks.length; index++) {
        const slider = placed.overclocks[index].base;
        y += 24;
        const minus = { x: PADDING, y, width: BUTTON_SIZE, height: BUTTON_SIZE };
        const plus = {
            x: SIDEBAR_WIDTH - PADDING - BUTTON_SIZE,
            y,
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
        };
        const track = {
            x: minus.x + BUTTON_SIZE + BUTTON_GAP,
            y: y + (BUTTON_SIZE - 18) / 2,
            width: plus.x - BUTTON_GAP - (minus.x + BUTTON_SIZE + BUTTON_GAP),
            height: 18,
        };
        y += BUTTON_SIZE;
        for (const field of EFFECT_FIELDS) {
            if (slider[field.key] !== undefined) {
                y += field.key === "jamChance" || field.key === "failChance" ? CHANCE_ROW : EFFECT_ROW;
            }
        }
        y += 16;
        cards.push({ index, track, minus, plus });
    }
    return cards;
}

export function drawOverclockPanel(placed: PlacedTile | null, modules: number): void {
    if (!placed?.base.turret) {
        drawText({
            text: "Select a placed turret",
            x: PADDING,
            y: SIDEBAR_CONTENT_TOP,
            font: "16px sans-serif",
            color: "#a8a49a",
            align: "left",
            baseline: "top",
        });
        return;
    }

    const turret = placed.base.turret;
    const cards = layoutOverclockCards(placed);
    for (const card of cards) {
        const instance = placed.overclocks[card.index];
        const adjusted = getOverclockedTurretStats(turret, [instance]);
        const nameY = card.minus.y - 24;

        drawText({
            text: instance.base.name,
            x: PADDING,
            y: nameY,
            font: "16px sans-serif",
            color: "#eceae4",
            align: "left",
            baseline: "top",
        });
        drawText({
            text: formatStat(instance.value),
            x: SIDEBAR_WIDTH - PADDING,
            y: nameY,
            font: "16px sans-serif",
            color: "#eceae4",
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
        let effectY = card.minus.y + card.minus.height + 10;
        for (const field of EFFECT_FIELDS) {
            if (instance.base[field.key] === undefined) {
                continue;
            }
            const chance = field.stat === "jamChance" || field.stat === "failChance";
            const valueFont = chance ? CHANCE_FONT : "14px sans-serif";
            let baseText: string;
            let nextText: string;
            if (field.stat === "jamChance" || field.stat === "failChance") {
                baseText = formatChance(0);
                nextText = formatChance(adjusted[field.stat]);
            } else {
                baseText = formatStat(turret[field.stat]);
                nextText = formatStat(adjusted[field.stat]);
            }
            const nextColor = chance ? CHANCE_COLOR : nextText === baseText ? "#eceae4" : "#e6c07b";
            const arrow = " -> ";
            const right = SIDEBAR_WIDTH - PADDING;
            const nextX = right - measureText(nextText, valueFont);
            const arrowX = nextX - measureText(arrow, valueFont);
            const baseX = arrowX - measureText(baseText, valueFont);
            drawText({
                text: field.label,
                x: PADDING,
                y: effectY,
                font: chance ? CHANCE_FONT : "14px sans-serif",
                color: chance ? CHANCE_COLOR : "#a8a49a",
                align: "left",
                baseline: "top",
            });
            drawText({
                text: baseText,
                x: baseX,
                y: effectY,
                font: valueFont,
                color: chance ? CHANCE_COLOR : "#eceae4",
                align: "left",
                baseline: "top",
            });
            drawText({
                text: arrow,
                x: arrowX,
                y: effectY,
                font: valueFont,
                color: chance ? CHANCE_COLOR : "#a8a49a",
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
}
