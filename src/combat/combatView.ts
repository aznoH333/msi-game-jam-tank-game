import { TILE_SIZE_PX } from "../building/types/tiles";
import { COMBAT_CAMERA_ZOOM } from "./constants";
import { drawRect, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import type { VehicleInstance } from "./types/vehicleInstance";

export interface CombatViewport {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface CombatVehicleLayout {
    cell: number;
    originX: number;
    originY: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** Fit the occupied tiles into the view. Null when the vehicle has no parts. */
export function layoutCombatVehicle(instance: VehicleInstance, view: CombatViewport): CombatVehicleLayout | null {
    if (instance.tiles.length === 0) {
        return null;
    }

    let minX = instance.tiles[0].tile.x;
    let minY = instance.tiles[0].tile.y;
    let maxX = minX + instance.tiles[0].tile.base.width;
    let maxY = minY + instance.tiles[0].tile.base.height;
    for (const part of instance.tiles) {
        minX = Math.min(minX, part.tile.x);
        minY = Math.min(minY, part.tile.y);
        maxX = Math.max(maxX, part.tile.x + part.tile.base.width);
        maxY = Math.max(maxY, part.tile.y + part.tile.base.height);
    }

    const footprintWidth = Math.max(1, maxX - minX);
    const footprintHeight = Math.max(1, maxY - minY);
    const availableWidth = Math.max(1, view.width - 48);
    const availableHeight = Math.max(1, view.height - 72);
    const fitted = Math.max(12, Math.min(72, availableWidth / footprintWidth, availableHeight / footprintHeight));
    const cell = fitted * COMBAT_CAMERA_ZOOM;
    return {
        cell,
        originX: view.x + (view.width - footprintWidth * cell) / 2 - minX * cell,
        originY: view.y + 48 + (availableHeight - footprintHeight * cell) / 2 - minY * cell,
        minX,
        minY,
        maxX,
        maxY,
    };
}

export interface CombatCamera {
    layout: CombatVehicleLayout;
    view: CombatViewport;
    /** Enemy cameras are mirrored so that tank faces the player. */
    inverted: boolean;
    /** World position of this tank's footprint center, in tiles. */
    worldX: number;
    worldY: number;
}

export function makeCombatCamera(
    layout: CombatVehicleLayout,
    view: CombatViewport,
    inverted: boolean,
    worldX: number,
    worldY: number,
): CombatCamera {
    return { layout, view, inverted, worldX, worldY };
}

function footprintCenter(layout: CombatVehicleLayout): { x: number; y: number } {
    return {
        x: (layout.minX + layout.maxX) / 2,
        y: (layout.minY + layout.maxY) / 2,
    };
}

/** World position of a point in this tank's tile grid. */
export function localToWorld(camera: CombatCamera, localX: number, localY: number): { x: number; y: number } {
    const center = footprintCenter(camera.layout);
    const dx = localX - center.x;
    const dy = localY - center.y;
    if (camera.inverted) {
        return { x: camera.worldX + dx, y: camera.worldY - dy };
    }
    return { x: camera.worldX + dx, y: camera.worldY + dy };
}

/** World position of a tile center, as seen by this tank's camera. */
export function tileToWorld(
    camera: CombatCamera,
    tileX: number,
    tileY: number,
    width: number,
    height: number,
): { x: number; y: number } {
    return localToWorld(camera, tileX + width / 2, tileY + height / 2);
}

/** Project a world point onto this camera. Both cameras share world +X right and world +Y down the screen. */
export function worldToScreen(camera: CombatCamera, worldX: number, worldY: number): { x: number; y: number } {
    const center = footprintCenter(camera.layout);
    const dx = worldX - camera.worldX;
    const dy = worldY - camera.worldY;
    const localX = center.x + dx;
    const localY = camera.inverted ? center.y - dy : center.y + dy;
    const rawX = camera.layout.originX + localX * camera.layout.cell;
    const rawY = camera.layout.originY + localY * camera.layout.cell;
    if (!camera.inverted) {
        return { x: rawX, y: rawY };
    }
    const footprintCenterY = camera.layout.originY + center.y * camera.layout.cell;
    return { x: rawX, y: footprintCenterY * 2 - rawY };
}

export function screenToWorld(camera: CombatCamera, screenX: number, screenY: number): { x: number; y: number } {
    const center = footprintCenter(camera.layout);
    const footprintCenterY = camera.layout.originY + center.y * camera.layout.cell;
    const rawY = camera.inverted ? footprintCenterY * 2 - screenY : screenY;
    const localX = (screenX - camera.layout.originX) / camera.layout.cell;
    const localY = (rawY - camera.layout.originY) / camera.layout.cell;
    const dx = localX - center.x;
    const dy = localY - center.y;
    if (camera.inverted) {
        return { x: camera.worldX + dx, y: camera.worldY - dy };
    }
    return { x: camera.worldX + dx, y: camera.worldY + dy };
}

/**
 * Rotation for a sprite whose barrel points up.
 * Inverted cameras flip the sprite vertically after this rotation.
 */
export function aimRotation(worldDx: number, worldDy: number, inverted: boolean): number {
    if (inverted) {
        return Math.atan2(-worldDx, worldDy);
    }
    return Math.atan2(worldDx, -worldDy);
}

/** Screen center of a tile. Inverted vehicles are mirrored vertically so they face the other tank. */
export function combatTileCenter(
    layout: CombatVehicleLayout,
    tileX: number,
    tileY: number,
    width: number,
    height: number,
    inverted: boolean,
): { x: number; y: number } {
    const centerX = layout.originX + (tileX + width / 2) * layout.cell;
    const centerY = layout.originY + (tileY + height / 2) * layout.cell;
    if (!inverted) {
        return { x: centerX, y: centerY };
    }
    const footprintCenterY = layout.originY + (layout.minY + layout.maxY) / 2 * layout.cell;
    return { x: centerX, y: footprintCenterY * 2 - centerY };
}

export function drawCombatVehicle(
    instance: VehicleInstance,
    view: CombatViewport,
    title: string,
    inverted: boolean,
    turretRotations: readonly number[],
): void {
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
