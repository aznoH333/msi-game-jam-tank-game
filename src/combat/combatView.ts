import { TILE_SIZE_PX } from "../building/types/tiles";
import { drawRect, setDrawClip, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import type { VehicleInstance } from "./types/vehicleInstance";
import {
    combatTileCenter,
    layoutCombatVehicle,
    type CombatViewport,
} from "./combatLayout";

export {
    aimRotation,
    combatTileCenter,
    layoutCombatVehicle,
    localToWorld,
    makeCombatCamera,
    screenToWorld,
    tileToWorld,
    worldToScreen,
    type CombatCamera,
    type CombatVehicleLayout,
    type CombatViewport,
} from "./combatLayout";

export function drawCombatVehicle(
    instance: VehicleInstance,
    view: CombatViewport,
    title: string,
    inverted: boolean,
    turretRotations: readonly number[],
): void {
    setDrawClip(null);
    drawRect({
        x: view.x,
        y: view.y,
        width: view.width,
        height: view.height,
        color: "#141820",
    });
    drawText({
        text: title,
        x: view.x + 24,
        y: view.y + 28,
        font: "20px sans-serif",
        color: "#d7d5cf",
        align: "left",
        baseline: "middle",
    });

    const layout = layoutCombatVehicle(instance, view);
    if (!layout) {
        drawText({
            text: "No parts",
            x: view.x + view.width / 2,
            y: view.y + view.height / 2,
            font: "16px sans-serif",
            color: "#a8a49a",
            align: "center",
            baseline: "middle",
        });
        return;
    }

    const footprintCenterY = layout.originY + (layout.minY + layout.maxY) / 2 * layout.cell;
    instance.tiles.forEach((part, index) => {
        if (part.health <= 0) {
            return;
        }
        const tile = part.tile;
        const maxHealth = tile.base.health;
        const healthRatio = maxHealth <= 0 ? 0 : Math.max(0, part.health) / maxHealth;
        // full color at full health, 30% of each channel when health is gone
        const shade = 0.3 + 0.7 * healthRatio;
        const channel = Math.round(255 * shade);
        const damageTint = shade >= 1 ? undefined : `rgb(${channel}, ${channel}, ${channel})`;
        const width = tile.base.width * layout.cell;
        const height = tile.base.height * layout.cell;
        const left = layout.originX + tile.x * layout.cell;
        const top = layout.originY + tile.y * layout.cell;
        const drawTop = inverted ? footprintCenterY * 2 - (top + height) : top;
        drawRect({
            x: left,
            y: drawTop,
            width,
            height,
            color: scaleColor("#2e3648", shade),
        });
        strokeRect({
            x: left + 0.5,
            y: drawTop + 0.5,
            width,
            height,
            color: scaleColor("#3a4254", shade),
        });
        const scale = layout.cell / TILE_SIZE_PX;
        const center = combatTileCenter(layout, tile.x, tile.y, tile.base.width, tile.base.height, inverted);
        drawSprite({
            sprite: tile.base.tileSprite,
            x: center.x,
            y: center.y,
            scaleX: scale,
            scaleY: inverted ? -scale : scale,
            color: damageTint,
            zIndex: 1,
        });
        if (tile.base.turret) {
            drawSprite({
                sprite: tile.base.turret.turretSprite,
                x: center.x,
                y: center.y,
                scaleX: scale,
                scaleY: inverted ? -scale : scale,
                rotationRad: turretRotations[index] ?? 0,
                color: damageTint,
                zIndex: 2,
            });
        }
    });
}

function scaleColor(hex: string, factor: number): string {
    const rgb = Number.parseInt(hex.slice(1), 16);
    const red = Math.round(((rgb >> 16) & 255) * factor);
    const green = Math.round(((rgb >> 8) & 255) * factor);
    const blue = Math.round((rgb & 255) * factor);
    return `rgb(${red}, ${green}, ${blue})`;
}
