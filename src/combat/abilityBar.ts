import type { TileInstance } from "./types/tileInstance";
import { TILE_SIZE_PX } from "../building/types/tiles";
import { drawRect, GAME_HEIGHT, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";

export const ABILITY_BAR_WIDTH = 300;

export interface AbilityButton {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export function layoutAbilityButtons(count: number): AbilityButton[] {
    const buttons: AbilityButton[] = [];
    let y = 56;
    for (let index = 0; index < count; index++) {
        buttons.push({
            index,
            x: 16,
            y,
            width: ABILITY_BAR_WIDTH - 32,
            height: 64,
        });
        y += 72;
    }
    return buttons;
}

export function drawAbilityBar(guns: TileInstance[], selectedAbility: number, cooldowns: number[]): void {
    drawRect({
        x: 0,
        y: 0,
        width: ABILITY_BAR_WIDTH,
        height: GAME_HEIGHT,
        color: "#1b1f2a",
    });
    drawRect({
        x: ABILITY_BAR_WIDTH - 1,
        y: 0,
        width: 1,
        height: GAME_HEIGHT,
        color: "#2e3546",
    });
    drawText({
        text: "Abilities",
        x: 16,
        y: 24,
        font: "20px sans-serif",
        color: "#d7d5cf",
        align: "left",
        baseline: "middle",
    });

    if (guns.length === 0) {
        drawText({
            text: "No guns",
            x: 16,
            y: 64,
            font: "16px sans-serif",
            color: "#a8a49a",
            align: "left",
            baseline: "top",
        });
        return;
    }

    const buttons = layoutAbilityButtons(guns.length);
    for (const button of buttons) {
        const gun = guns[button.index];
        const selected = button.index === selectedAbility;
        drawRect({
            x: button.x,
            y: button.y,
            width: button.width,
            height: button.height,
            color: selected ? "#343c50" : "#262c3a",
        });
        if (selected) {
            strokeRect({
                x: button.x + 1,
                y: button.y + 1,
                width: button.width - 2,
                height: button.height - 2,
                color: "#e6c07b",
                lineWidth: 2,
            });
        }

        const iconSize = 40;
        const scale = iconSize / (Math.max(gun.tile.base.width, gun.tile.base.height) * TILE_SIZE_PX);
        const iconX = button.x + 12 + iconSize / 2;
        const iconY = button.y + button.height / 2;
        drawSprite({
            sprite: gun.tile.base.tileSprite,
            x: iconX,
            y: iconY,
            scaleX: scale,
            scaleY: scale,
            zIndex: 3,
        });
        if (gun.tile.base.turret) {
            drawSprite({
                sprite: gun.tile.base.turret.turretSprite,
                x: iconX,
                y: iconY,
                scaleX: scale,
                scaleY: scale,
                zIndex: 4,
            });
        }
        drawText({
            text: gun.tile.base.tileName,
            x: button.x + 64,
            y: iconY,
            font: "16px sans-serif",
            color: "#eceae4",
            align: "left",
            baseline: "middle",
        });
        const cooldown = cooldowns[button.index] ?? 0;
        if (cooldown > 0) {
            drawText({
                text: cooldown.toFixed(1),
                x: button.x + button.width - 12,
                y: iconY,
                font: "16px sans-serif",
                color: "#e6c07b",
                align: "right",
                baseline: "middle",
            });
        }
    }
}
