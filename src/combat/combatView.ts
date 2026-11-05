import { tankTrackColumns, tankTrackSprite } from "../building/tankTracks";
import { TILE_SIZE_PX, tileSpriteAt } from "../building/types/tiles";
import { drawRect, getDrawClip, setDrawClip, strokeRect } from "../drawing/canvas";
import { drawSprite, getSpriteSize } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import { HIT_FLASH_DURATION } from "./constants";
import type { VehicleInstance } from "./types/vehicleInstance";
import {
    combatTileCenter,
    layoutCombatVehicle,
    type CombatVehicleLayout,
    type CombatViewport,
} from "./combatLayout";

const BROKEN_TILE_SPRITES = ["tiles/tiles_1x1_0007", "tiles/tiles_1x1_0008"];
const GROUND_SPRITE = "combat/ground";
/** Source pixel of the road that sits on the vehicle center. The strip is 620 wide. */
const GROUND_CENTER_X = 310;

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
    shakeX = 0,
    shakeY = 0,
    /** Tiles of forward travel. Scrolls the road and steps the treads. Zero holds both still. */
    scrollTiles = 0,
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
    drawCombatGround(view, layout, shakeX, shakeY, scrollTiles);
    setDrawClip({ x: view.x, y: view.y, width: view.width, height: view.height });
    const scale = layout.cell / TILE_SIZE_PX;
    const trackSprite = tankTrackSprite(scrollTiles);
    const tracks = tankTrackColumns(instance.tiles.map((part) => ({
        x: part.tile.x,
        y: part.tile.y,
        width: part.tile.base.width,
        height: part.tile.base.height,
    })));
    for (const track of tracks) {
        for (let step = 0; step < track.length; step++) {
            const center = combatTileCenter(layout, track.x, track.y + step, 1, 1, inverted);
            center.x += shakeX;
            center.y += shakeY;
            drawSprite({
                sprite: trackSprite,
                x: center.x,
                y: center.y,
                scaleX: scale,
                scaleY: inverted ? -scale : scale,
                zIndex: 0,
            });
        }
    }
    instance.tiles.forEach((part, index) => {
        const tile = part.tile;
        const flash = tileFlash(part.hitFlash);
        if (part.health <= 0) {
            drawDestroyedTile(layout, tile.x, tile.y, tile.base.width, tile.base.height, inverted, shakeX, shakeY, flash);
            return;
        }
        const maxHealth = tile.base.health;
        const healthRatio = maxHealth <= 0 ? 0 : Math.max(0, part.health) / maxHealth;
        // full color at full health, 30% of each channel when health is gone
        const shade = 0.3 + 0.7 * healthRatio;
        const channel = Math.round(255 * shade);
        const damageTint = shade >= 1 ? undefined : `rgb(${channel}, ${channel}, ${channel})`;
        const width = tile.base.width * layout.cell;
        const height = tile.base.height * layout.cell;
        const left = layout.originX + tile.x * layout.cell + shakeX;
        const top = layout.originY + tile.y * layout.cell;
        const drawTop = (inverted ? footprintCenterY * 2 - (top + height) : top) + shakeY;
        drawRect({
            x: left,
            y: drawTop,
            width,
            height,
            color: scaleColor("#2e3648", shade, flash),
        });
        strokeRect({
            x: left + 0.5,
            y: drawTop + 0.5,
            width,
            height,
            color: scaleColor("#3a4254", shade, flash),
        });
        const center = combatTileCenter(layout, tile.x, tile.y, tile.base.width, tile.base.height, inverted);
        center.x += shakeX;
        center.y += shakeY;
        drawSprite({
            sprite: tileSpriteAt(tile.base.tileSprite, tile.x, tile.y),
            x: center.x,
            y: center.y,
            scaleX: scale,
            scaleY: inverted ? -scale : scale,
            color: damageTint,
            white: flash,
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
                originX: tile.base.turret.spriteCenterX,
                originY: tile.base.turret.spriteCenterY,
                color: damageTint,
                white: flash,
                zIndex: 2,
            });
        }
    });
    setDrawClip(null);
}

/** One road strip, scaled like the tiles, repeated down the view. Pixel 310 sits on the vehicle center. */
function drawCombatGround(
    view: CombatViewport,
    layout: CombatVehicleLayout,
    shakeX: number,
    shakeY: number,
    scrollTiles: number,
): void {
    const size = getSpriteSize(GROUND_SPRITE);
    if (!size || size.height <= 0) {
        return;
    }
    const scale = layout.cell / TILE_SIZE_PX;
    const drawnHeight = size.height * scale;
    const centerX = layout.originX + (layout.minX + layout.maxX) / 2 * layout.cell + shakeX;
    const centerY = layout.originY + (layout.minY + layout.maxY) / 2 * layout.cell + shakeY;
    const scrollPx = scrollTiles * layout.cell;
    const phase = ((scrollPx % drawnHeight) + drawnHeight) % drawnHeight;
    let y = centerY + phase;
    while (y - drawnHeight / 2 > view.y) {
        y -= drawnHeight;
    }
    const previousClip = getDrawClip();
    setDrawClip({ x: view.x, y: view.y, width: view.width, height: view.height });
    const bottom = view.y + view.height;
    while (y - drawnHeight / 2 < bottom) {
        drawSprite({
            sprite: GROUND_SPRITE,
            x: centerX,
            y,
            scaleX: scale,
            scaleY: scale,
            originX: GROUND_CENTER_X,
            zIndex: -1,
        });
        y += drawnHeight;
    }
    setDrawClip(previousClip);
}

/** The wreck sprite is one cell. Stamp it across every cell of a larger part. */
function drawDestroyedTile(
    layout: CombatVehicleLayout,
    tileX: number,
    tileY: number,
    width: number,
    height: number,
    inverted: boolean,
    shakeX: number,
    shakeY: number,
    flash: number,
): void {
    const scale = layout.cell / TILE_SIZE_PX;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const center = combatTileCenter(layout, tileX + x, tileY + y, 1, 1, inverted);
            center.x += shakeX;
            center.y += shakeY;
            drawSprite({
                sprite: tileSpriteAt(BROKEN_TILE_SPRITES, tileX + x, tileY + y),
                x: center.x,
                y: center.y,
                scaleX: scale,
                scaleY: inverted ? -scale : scale,
                white: flash,
                zIndex: 1,
            });
        }
    }
}

/** 1 on the frame a tile is hit, then down to 0 over the flash. */
function tileFlash(hitFlash: number): number {
    if (hitFlash <= 0) {
        return 0;
    }
    return Math.min(1, hitFlash / HIT_FLASH_DURATION);
}

function scaleColor(hex: string, factor: number, white = 0): string {
    const rgb = Number.parseInt(hex.slice(1), 16);
    const channel = (value: number) => Math.round(value * factor + (255 - value * factor) * white);
    const red = channel((rgb >> 16) & 255);
    const green = channel((rgb >> 8) & 255);
    const blue = channel(rgb & 255);
    return `rgb(${red}, ${green}, ${blue})`;
}
