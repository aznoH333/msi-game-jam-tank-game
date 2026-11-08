import { ABILITY_BAR_WIDTH } from "../combat/constants";
import { drawRect, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import { TILE_SIZE_PX, tileSpriteAt, type BaseTile, type TileType } from "../building/types/tiles";

/** Matches the combat ability bar so the two left sidebars line up. */
export const SIDEBAR_WIDTH = ABILITY_BAR_WIDTH;
export const SIDEBAR_CONTENT_TOP = 68;

export type EditorTab = TileType | "OVERCLOCK" | "ITEMS";

const TABS: { type: EditorTab; label: string }[] = [
    { type: "WEAPON", label: "weapons" },
    { type: "UTILITY", label: "utility" },
    { type: "BLOCK", label: "blocks" },
    { type: "OVERCLOCK", label: "overclocks" },
];

export interface Bounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SidebarTab {
    type: EditorTab;
    label: string;
    active: boolean;
    bounds: Bounds;
}

export interface SidebarEntry {
    tile: BaseTile;
    bounds: Bounds;
}

export interface SidebarLayout {
    bounds: Bounds;
    tabs: SidebarTab[];
    entries: SidebarEntry[];
}

export function layoutSidebar(screenHeight: number, activeTab: EditorTab, tiles: BaseTile[]): SidebarLayout {
    const padding = 16;
    const tabY = 16;
    const tabHeight = 36;
    const tabGap = 6;
    const tabWidth = (SIDEBAR_WIDTH - padding * 2 - tabGap * (TABS.length - 1)) / TABS.length;

    const tabs = TABS.map((tab, index) => ({
        type: tab.type,
        label: tab.label,
        active: tab.type === activeTab,
        bounds: {
            x: padding + index * (tabWidth + tabGap),
            y: tabY,
            width: tabWidth,
            height: tabHeight,
        },
    }));

    const entryHeight = 64;
    const entryGap = 8;
    let entryY = SIDEBAR_CONTENT_TOP;
    const entries = tiles.map((tile) => {
        const bounds = {
            x: padding,
            y: entryY,
            width: SIDEBAR_WIDTH - padding * 2,
            height: entryHeight,
        };
        entryY += entryHeight + entryGap;
        return { tile, bounds };
    });

    return {
        bounds: { x: 0, y: 0, width: SIDEBAR_WIDTH, height: screenHeight },
        tabs,
        entries,
    };
}

export function drawBuildingSidebar(layout: SidebarLayout, selected: BaseTile | null, money: number, unlockedTiles: readonly string[]): void {
    // sidebar background
    drawRect({
        x: layout.bounds.x,
        y: layout.bounds.y,
        width: layout.bounds.width,
        height: layout.bounds.height,
        color: "#1b1f2a",
    });
    drawRect({
        x: layout.bounds.width - 1,
        y: 0,
        width: 1,
        height: layout.bounds.height,
        color: "#2e3546",
    });

    for (const tab of layout.tabs) {
        drawRect({
            x: tab.bounds.x,
            y: tab.bounds.y,
            width: tab.bounds.width,
            height: tab.bounds.height,
            color: tab.active ? "#3d465c" : "#2a3040",
        });
        drawText({
            text: tab.label,
            x: tab.bounds.x + tab.bounds.width / 2,
            y: tab.bounds.y + tab.bounds.height / 2,
            font: "11px sans-serif",
            color: "#eceae4",
            align: "center",
            baseline: "middle",
        });
    }

    const listingTiles = layout.tabs.some((tab) => {
        return tab.active && (tab.type === "WEAPON" || tab.type === "UTILITY" || tab.type === "BLOCK");
    });
    if (layout.entries.length === 0 && listingTiles) {
        drawText({
            text: "No parts",
            x: 24,
            y: layout.tabs[0].bounds.y + layout.tabs[0].bounds.height + 24,
            font: "14px sans-serif",
            color: "#a8a49a",
            align: "left",
            baseline: "top",
        });
        return;
    }

    const iconSize = 40;

    for (const entry of layout.entries) {
        const iconScale = iconSize / (Math.max(entry.tile.width, entry.tile.height) * TILE_SIZE_PX);
        const selectedEntry = entry.tile === selected;
        const affordable = entry.tile.price <= money;
        drawRect({
            x: entry.bounds.x,
            y: entry.bounds.y,
            width: entry.bounds.width,
            height: entry.bounds.height,
            color: affordable ? (selectedEntry ? "#343c50" : "#262c3a") : (selectedEntry ? "#8a3038" : "#6e2430"),
        });

        if (selectedEntry) {
            strokeRect({
                x: entry.bounds.x + 1,
                y: entry.bounds.y + 1,
                width: entry.bounds.width - 2,
                height: entry.bounds.height - 2,
                color: "#e6c07b",
                lineWidth: 2,
            });
        }

        const iconX = entry.bounds.x + 12 + iconSize / 2;
        const iconY = entry.bounds.y + entry.bounds.height / 2;
        const unlocked = unlockedTiles.includes(entry.tile.tileName);
        const iconColor = unlocked ? undefined : "#000000";
        drawSprite({
            sprite: tileSpriteAt(entry.tile.tileSprite, 0, 0),
            x: iconX,
            y: iconY,
            scaleX: iconScale,
            scaleY: iconScale,
            zIndex: 3,
            color: iconColor,
        });
        if (entry.tile.turret) {
            drawSprite({
                sprite: entry.tile.turret.turretSprite,
                x: iconX,
                y: iconY,
                scaleX: iconScale,
                scaleY: iconScale,
                originX: entry.tile.turret.spriteCenterX,
                originY: entry.tile.turret.spriteCenterY,
                zIndex: 4,
                color: iconColor,
            });
        }

        drawText({
            text: unlocked ? entry.tile.tileName : "???",
            x: entry.bounds.x + 12 + iconSize + 12,
            y: entry.bounds.y + entry.bounds.height / 2,
            font: "16px sans-serif",
            color: unlocked ? "#eceae4" : "#8b919c",
            align: "left",
            baseline: "middle",
        });
    }
}
