import { getOverclockedTurretStats, getPowerPerSecond, getTotalPowerCapacity } from "../building/vehicleUtils";
import { TILE_SIZE_PX, type BaseTile, type PlacedTile } from "../building/types/tiles";
import type { BaseVehicle } from "../building/types/vehicle";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, setDrawClip, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText, measureText } from "../drawing/text";
import { consumeTypedText, getMousePosition, isMouseButtonDown } from "../input/input";

export const DETAILS_SIDEBAR_WIDTH = 300;

const PADDING = 20;
const ROW_HEIGHT = 28;
const NAME_LIMIT = 20;
const NAME_FONT = "16px sans-serif";
const NAME_FIELD_Y = 88;
const NAME_FIELD_HEIGHT = 34;

let nameFieldFocused = false;
let leftWasDown = false;

function nameFieldBounds(): { x: number; y: number; width: number; height: number } {
    return {
        x: GAME_WIDTH - DETAILS_SIDEBAR_WIDTH + PADDING,
        y: NAME_FIELD_Y,
        width: DETAILS_SIDEBAR_WIDTH - PADDING * 2,
        height: NAME_FIELD_HEIGHT,
    };
}

function drawInfoRow(x: number, y: number, label: string, value: string, changed = false): number {
    drawText({
        text: label,
        x,
        y,
        font: "16px sans-serif",
        color: changed ? "#e6c07b" : "#a8a49a",
        align: "left",
        baseline: "top",
    });
    drawText({
        text: value,
        x: x + DETAILS_SIDEBAR_WIDTH - PADDING * 2,
        y,
        font: "16px sans-serif",
        color: changed ? "#e6c07b" : "#eceae4",
        align: "right",
        baseline: "top",
    });
    return y + ROW_HEIGHT;
}

function formatFinalStat(base: number, final: number): { text: string; changed: boolean } {
    const shown = String(Math.round(final * 1000) / 1000);
    const baseShown = Math.round(base * 1000) / 1000;
    const finalShown = Math.round(final * 1000) / 1000;
    if (baseShown === finalShown) {
        return { text: shown, changed: false };
    }
    if (baseShown === 0) {
        return { text: shown, changed: true };
    }
    const percent = Math.round(((final - base) / base) * 1000) / 10;
    if (percent === 0) {
        return { text: shown, changed: false };
    }
    const sign = percent < 0 ? "" : "+";
    return { text: `${shown} (${sign}${percent}%)`, changed: true };
}

/** Click the name field to type. The name stays at 20 characters. */
export function updateVehicleNameInput(vehicle: BaseVehicle): void {
    const mouse = getMousePosition();
    const leftDown = isMouseButtonDown(0);
    if (leftDown && !leftWasDown) {
        const field = nameFieldBounds();
        nameFieldFocused = mouse.x >= field.x
            && mouse.y >= field.y
            && mouse.x < field.x + field.width
            && mouse.y < field.y + field.height;
    }
    leftWasDown = leftDown;

    const typed = consumeTypedText();
    if (!nameFieldFocused) {
        return;
    }
    for (const char of typed) {
        if (char === "\n") {
            nameFieldFocused = false;
            break;
        }
        if (char === "\b") {
            vehicle.name = vehicle.name.slice(0, -1);
            continue;
        }
        if (vehicle.name.length < NAME_LIMIT) {
            vehicle.name += char;
        }
    }
}

export function drawVehicleDetailsSidebar(
    vehicle: BaseVehicle,
    selected: BaseTile | null,
    money: number,
    overclockTile?: PlacedTile | null,
): void {
    const x = GAME_WIDTH - DETAILS_SIDEBAR_WIDTH;
    const midY = GAME_HEIGHT / 2;

    // sidebar background
    drawRect({
        x,
        y: 0,
        width: DETAILS_SIDEBAR_WIDTH,
        height: GAME_HEIGHT,
        color: "#1b1f2a",
    });
    drawRect({
        x,
        y: 0,
        width: 1,
        height: GAME_HEIGHT,
        color: "#2e3546",
    });
    drawRect({
        x: x + PADDING,
        y: midY,
        width: DETAILS_SIDEBAR_WIDTH - PADDING * 2,
        height: 1,
        color: "#2e3546",
    });

    // vehicle summary
    drawText({
        text: "Vehicle",
        x: x + PADDING,
        y: 28,
        font: "20px sans-serif",
        color: "#d7d5cf",
        align: "left",
        baseline: "top",
    });
    drawText({
        text: "Name",
        x: x + PADDING,
        y: 60,
        font: "16px sans-serif",
        color: "#a8a49a",
        align: "left",
        baseline: "top",
    });

    // name input
    const field = nameFieldBounds();
    drawRect({
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        color: "#141820",
    });
    strokeRect({
        x: field.x + 0.5,
        y: field.y + 0.5,
        width: field.width - 1,
        height: field.height - 1,
        color: nameFieldFocused ? "#e6c07b" : "#3a4254",
    });
    setDrawClip({
        x: field.x + 8,
        y: field.y,
        width: field.width - 16,
        height: field.height,
    });
    drawText({
        text: vehicle.name,
        x: field.x + 8,
        y: field.y + field.height / 2,
        font: NAME_FONT,
        color: "#eceae4",
        align: "left",
        baseline: "middle",
    });
    if (nameFieldFocused && Math.floor(performance.now() / 500) % 2 === 0) {
        drawRect({
            x: field.x + 8 + measureText(vehicle.name, NAME_FONT),
            y: field.y + 8,
            width: 1,
            height: field.height - 16,
            color: "#eceae4",
        });
    }
    setDrawClip(null);

    let rowY = field.y + field.height + 16;
    rowY = drawInfoRow(x + PADDING, rowY, "Power capacity", String(getTotalPowerCapacity(vehicle)));
    rowY = drawInfoRow(x + PADDING, rowY, "Power generation", String(getPowerPerSecond(vehicle)));
    rowY = drawInfoRow(x + PADDING, rowY, "Tile count", String(vehicle.tiles.length));
    drawInfoRow(x + PADDING, rowY, "Money", String(money));

    const overclockMode = overclockTile !== undefined;
    const shown = overclockMode ? overclockTile?.base ?? null : selected;
    if (!shown) {
        drawText({
            text: overclockMode ? "Select a turret" : "No part selected",
            x: x + PADDING,
            y: midY + 28,
            font: "16px sans-serif",
            color: "#a8a49a",
            align: "left",
            baseline: "top",
        });
        return;
    }

    // scaled preview above the part name
    const previewSize = 112;
    const previewX = x + (DETAILS_SIDEBAR_WIDTH - previewSize) / 2;
    const previewY = midY + 16;
    drawRect({
        x: previewX,
        y: previewY,
        width: previewSize,
        height: previewSize,
        color: "#262c3a",
    });
    strokeRect({
        x: previewX + 0.5,
        y: previewY + 0.5,
        width: previewSize - 1,
        height: previewSize - 1,
        color: "#3a4254",
    });
    const previewScale = previewSize / (Math.max(shown.width, shown.height) * TILE_SIZE_PX);
    const previewCenterX = previewX + previewSize / 2;
    const previewCenterY = previewY + previewSize / 2;
    drawSprite({
        sprite: shown.tileSprite,
        x: previewCenterX,
        y: previewCenterY,
        scaleX: previewScale,
        scaleY: previewScale,
        zIndex: 5,
    });
    if (shown.turret) {
        drawSprite({
            sprite: shown.turret.turretSprite,
            x: previewCenterX,
            y: previewCenterY,
            scaleX: previewScale,
            scaleY: previewScale,
            zIndex: 6,
        });
    }

    drawText({
        text: shown.tileName,
        x: x + PADDING,
        y: previewY + previewSize + 16,
        font: "22px sans-serif",
        color: "#eceae4",
        align: "left",
        baseline: "top",
    });

    // part stats; hide optional power and turret fields this part does not define
    rowY = previewY + previewSize + 48;
    rowY = drawInfoRow(x + PADDING, rowY, "Description", "placeholder");
    rowY = drawInfoRow(x + PADDING, rowY, "Price", String(shown.price));
    rowY = drawInfoRow(x + PADDING, rowY, "Weight", "placeholder");
    rowY = drawInfoRow(x + PADDING, rowY, "Power draw", "placeholder");
    if (shown.powerGenerationPerSecond !== undefined) {
        rowY = drawInfoRow(x + PADDING, rowY, "Power generation", String(shown.powerGenerationPerSecond));
    }
    if (shown.powerCapacity !== undefined) {
        rowY = drawInfoRow(x + PADDING, rowY, "Power capacity", String(shown.powerCapacity));
    }
    if (shown.turret && overclockTile) {
        const turret = shown.turret;
        const final = getOverclockedTurretStats(turret, overclockTile.overclocks);
        const damage = formatFinalStat(turret.damagePerShot, final.damagePerShot);
        const power = formatFinalStat(turret.powerPerShot, final.powerPerShot);
        const salvo = formatFinalStat(turret.salvoCount, final.salvoCount);
        const salvoDelay = formatFinalStat(turret.salvoDelay, final.salvoDelay);
        const accuracy = formatFinalStat(turret.accuracy, final.accuracy);
        const reload = formatFinalStat(turret.reloadTime, final.reloadTime);
        rowY = drawInfoRow(x + PADDING, rowY, "Damage", damage.text, damage.changed);
        rowY = drawInfoRow(x + PADDING, rowY, "Power per shot", power.text, power.changed);
        rowY = drawInfoRow(x + PADDING, rowY, "Salvo count", salvo.text, salvo.changed);
        rowY = drawInfoRow(x + PADDING, rowY, "Salvo delay", salvoDelay.text, salvoDelay.changed);
        rowY = drawInfoRow(x + PADDING, rowY, "Accuracy", accuracy.text, accuracy.changed);
        drawInfoRow(x + PADDING, rowY, "Reload time", reload.text, reload.changed);
    } else if (shown.turret) {
        const turret = shown.turret;
        rowY = drawInfoRow(x + PADDING, rowY, "Damage", String(turret.damagePerShot));
        rowY = drawInfoRow(x + PADDING, rowY, "Power per shot", String(turret.powerPerShot));
        rowY = drawInfoRow(x + PADDING, rowY, "Salvo count", String(turret.salvoCount));
        rowY = drawInfoRow(x + PADDING, rowY, "Salvo delay", String(turret.salvoDelay));
        rowY = drawInfoRow(x + PADDING, rowY, "Accuracy", String(turret.accuracy));
        drawInfoRow(x + PADDING, rowY, "Reload time", String(turret.reloadTime));
    }
}
