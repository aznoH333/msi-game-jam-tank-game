import { ABILITY_BAR_WIDTH } from "./constants";
import type { TileInstance } from "./types/tileInstance";
import { TILE_SIZE_PX, tileSpriteAt } from "../building/types/tiles";
import { getOverclockedTurretStats } from "../building/vehicleUtils";
import { drawRect, GAME_HEIGHT, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import { drawDriverPortrait, type DriverPortraitState } from "../ui/driverPortrait";
import { drawModuleReadout, drawMoneyReadout, drawWeaponSlotReadout } from "../ui/moneyReadout";

export { ABILITY_BAR_WIDTH };

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

/** The repair slot sits under the weapon buttons. */
export function repairButtonBounds(gunCount: number): AbilityButton {
    return {
        index: gunCount,
        x: 16,
        y: 56 + gunCount * 72,
        width: ABILITY_BAR_WIDTH - 32,
        height: 64,
    };
}

export function drawAbilityBar(
    guns: TileInstance[],
    selectedAbility: number,
    cooldowns: number[],
    repair?: { selected: boolean; cooldown: number },
): void {
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

    if (guns.length === 0 && !repair) {
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
        const cooldown = cooldowns[button.index] ?? 0;
        const reloadTime = gun.tile.base.turret
            ? getOverclockedTurretStats(gun.tile.base.turret, gun.tile.overclocks).reloadTime
            : 0;
        if (cooldown > 0 && reloadTime > 0) {
            const ready = Math.max(0, Math.min(1, 1 - cooldown / reloadTime));
            drawRect({
                x: button.x,
                y: button.y,
                width: button.width * ready,
                height: button.height,
                color: "rgba(196, 164, 82, 0.38)",
            });
        }
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
            sprite: tileSpriteAt(gun.tile.base.tileSprite, gun.tile.x, gun.tile.y),
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
                originX: gun.tile.base.turret.spriteCenterX,
                originY: gun.tile.base.turret.spriteCenterY,
                zIndex: 4,
            });
        }
        const hotkey = button.index < 9 ? `${button.index + 1}  ` : "";
        drawText({
            text: `${hotkey}${gun.tile.base.tileName}`,
            x: button.x + 64,
            y: iconY,
            font: "16px sans-serif",
            color: "#eceae4",
            align: "left",
            baseline: "middle",
        });
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

    if (!repair) {
        return;
    }
    const repairButton = repairButtonBounds(guns.length);
    drawRect({
        x: repairButton.x,
        y: repairButton.y,
        width: repairButton.width,
        height: repairButton.height,
        color: repair.selected ? "#343c50" : "#262c3a",
    });
    if (repair.selected) {
        strokeRect({
            x: repairButton.x + 1,
            y: repairButton.y + 1,
            width: repairButton.width - 2,
            height: repairButton.height - 2,
            color: "#e6c07b",
            lineWidth: 2,
        });
    }
    drawText({
        text: "R  Repair",
        x: repairButton.x + 16,
        y: repairButton.y + repairButton.height / 2,
        font: "16px sans-serif",
        color: "#8ee0a8",
        align: "left",
        baseline: "middle",
    });
    if (repair.cooldown > 0) {
        drawText({
            text: repair.cooldown.toFixed(1),
            x: repairButton.x + repairButton.width - 12,
            y: repairButton.y + repairButton.height / 2,
            font: "16px sans-serif",
            color: "#e6c07b",
            align: "right",
            baseline: "middle",
        });
    }
}

/** Remaining health as a share of the vehicle's total hit points. */
export function drawHealthBar(x: number, y: number, width: number, ratio: number): void {
    const shown = Math.max(0, Math.min(1, ratio));
    drawText({
        text: "HP",
        x,
        y,
        font: "16px sans-serif",
        color: "#d7d5cf",
        align: "left",
        baseline: "middle",
    });
    drawText({
        text: `${Math.floor(shown * 100)}%`,
        x: x + width,
        y,
        font: "16px sans-serif",
        color: "#eceae4",
        align: "right",
        baseline: "middle",
    });
    const barY = y + 16;
    const barHeight = 10;
    drawRect({
        x,
        y: barY,
        width,
        height: barHeight,
        color: "#141820",
        zIndex: 8,
    });
    if (shown > 0) {
        drawRect({
            x,
            y: barY,
            width: Math.max(1, width * shown),
            height: barHeight,
            color: "#3fbe6e",
            zIndex: 8,
        });
    }
}

/** Top-right of a tank view. The player and the enemy use the same corner. */
export function drawViewEnergy(
    view: { x: number; y: number; width: number },
    current: number,
    capacity: number,
    generation: number,
): void {
    drawEnergyReadout(view.x + view.width - 220, view.y + 16, 200, current, capacity, generation);
}

/** Money at the bottom of the left sidebar, with modules and weapon slots stacked above it. */
export function driverPortraitFrame(): { x: number; y: number; width: number; height: number } {
    const width = ABILITY_BAR_WIDTH - 32;
    const moneyY = GAME_HEIGHT - 72;
    const weaponY = moneyY - 64;
    return { x: 16, y: weaponY - 12 - width, width, height: width };
}

export function drawAbilityBarMoney(
    money: number,
    modules: number,
    weaponsPlaced: number,
    weaponSlots: number,
    driver?: DriverPortraitState,
): void {
    const portrait = driverPortraitFrame();
    const moneyY = GAME_HEIGHT - 72;
    const weaponY = moneyY - 64;
    drawDriverPortrait(portrait.x, portrait.y, portrait.width, driver ?? { healthRatio: 1, shakeX: 0, shakeY: 0 });
    drawWeaponSlotReadout(16, weaponY, portrait.width, weaponsPlaced, weaponSlots);
    drawModuleReadout(16, moneyY - 32, portrait.width, modules);
    drawMoneyReadout(16, moneyY, portrait.width, money);
}

/** Stored energy, its cap, and how fast living generators refill it. */
export function drawEnergyReadout(
    x: number,
    y: number,
    width: number,
    current: number,
    capacity: number,
    generation: number,
): void {
    const shownCurrent = Math.max(0, current);
    const shownCapacity = Math.max(0, capacity);
    drawText({
        text: "Energy",
        x,
        y,
        font: "16px sans-serif",
        color: "#d7d5cf",
        align: "left",
        baseline: "middle",
    });
    drawText({
        text: `${Math.round(shownCurrent)} / ${Math.round(shownCapacity)}`,
        x: x + width,
        y,
        font: "16px sans-serif",
        color: "#eceae4",
        align: "right",
        baseline: "middle",
    });
    drawText({
        text: `+${Math.round(generation)}/s`,
        x,
        y: y + 18,
        font: "14px sans-serif",
        color: "#8ecbff",
        align: "left",
        baseline: "middle",
    });
    const barY = y + 32;
    const barHeight = 10;
    drawRect({
        x,
        y: barY,
        width,
        height: barHeight,
        color: "#141820",
        zIndex: 8,
    });
    const ratio = shownCapacity <= 0 ? 0 : Math.min(1, shownCurrent / shownCapacity);
    if (ratio > 0) {
        drawRect({
            x,
            y: barY,
            width: Math.max(1, width * ratio),
            height: barHeight,
            color: "#3d9ee8",
            zIndex: 8,
        });
    }
}
