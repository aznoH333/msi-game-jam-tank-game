import { getPowerPerSecond, getTotalPowerCapacity } from "../building/vehicleUtils";
import { TILE_SIZE_PX, type BaseTile } from "../building/types/tiles";
import type { BaseVehicle } from "../building/types/vehicles";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";

export const DETAILS_SIDEBAR_WIDTH = 300;

const PADDING = 20;
const ROW_HEIGHT = 32;

function drawInfoRow(x: number, y: number, label: string, value: string): number {
    drawText({
        text: label,
        x,
        y,
        font: "16px sans-serif",
        color: "#a8a49a",
        align: "left",
        baseline: "top",
    });
    drawText({
        text: value,
        x: x + DETAILS_SIDEBAR_WIDTH - PADDING * 2,
        y,
        font: "16px sans-serif",
        color: "#eceae4",
        align: "right",
        baseline: "top",
    });
    return y + ROW_HEIGHT;
}

export function drawVehicleDetailsSidebar(vehicle: BaseVehicle, selected: BaseTile | null): void {
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
    let rowY = 68;
    rowY = drawInfoRow(x + PADDING, rowY, "Name", "placeholder");
    rowY = drawInfoRow(x + PADDING, rowY, "Power capacity", String(getTotalPowerCapacity(vehicle)));
    rowY = drawInfoRow(x + PADDING, rowY, "Power generation", String(getPowerPerSecond(vehicle)));
    drawInfoRow(x + PADDING, rowY, "Tile count", String(vehicle.tiles.length));

    if (!selected) {
        drawText({
            text: "No part selected",
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
    const previewSize = 160;
    const previewX = x + (DETAILS_SIDEBAR_WIDTH - previewSize) / 2;
    const previewY = midY + 24;
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
    const previewScale = previewSize / (Math.max(selected.width, selected.height) * TILE_SIZE_PX);
    const previewCenterX = previewX + previewSize / 2;
    const previewCenterY = previewY + previewSize / 2;
    drawSprite({
        sprite: selected.tileSprite,
        x: previewCenterX,
        y: previewCenterY,
        scaleX: previewScale,
        scaleY: previewScale,
        zIndex: 5,
    });
    if (selected.turretSprite) {
        drawSprite({
            sprite: selected.turretSprite,
            x: previewCenterX,
            y: previewCenterY,
            scaleX: previewScale,
            scaleY: previewScale,
            zIndex: 6,
        });
    }

    drawText({
        text: selected.tileName,
        x: x + PADDING,
        y: previewY + previewSize + 20,
        font: "22px sans-serif",
        color: "#eceae4",
        align: "left",
        baseline: "top",
    });

    // part stats; hide optional power fields that this part does not define
    rowY = previewY + previewSize + 60;
    rowY = drawInfoRow(x + PADDING, rowY, "Description", "placeholder");
    rowY = drawInfoRow(x + PADDING, rowY, "Price", "placeholder");
    rowY = drawInfoRow(x + PADDING, rowY, "Weight", "placeholder");
    rowY = drawInfoRow(x + PADDING, rowY, "Power draw", "placeholder");
    if (selected.powerGenerationPerSecond !== undefined) {
        rowY = drawInfoRow(x + PADDING, rowY, "Power generation", String(selected.powerGenerationPerSecond));
    }
    if (selected.powerCapacity !== undefined) {
        drawInfoRow(x + PADDING, rowY, "Power capacity", String(selected.powerCapacity));
    }
}
