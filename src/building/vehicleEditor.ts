import { drawRect, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import type { GameState } from "../game/gameState";
import { getMousePosition, isMouseButtonDown } from "../input/input";
import { drawBuildingSidebar, layoutSidebar, SIDEBAR_WIDTH, type Bounds } from "../ui/buildingSidebar";
import { TILE_CATALOG } from "./constants/tileCatalog";
import { TILE_SIZE_PX, type BaseTile, type TileType } from "./types/tiles";

const GRID_COLUMNS = 12;
const GRID_ROWS = 10;
const CELL_SIZE_PX = 40;

interface GridGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    cell: number;
}

let selectedTab: TileType = "BLOCK";
let selectedTile: BaseTile | null = TILE_CATALOG.BLOCK[0] ?? null;

function vehicleGridGeometry(): GridGeometry {
    const width = GRID_COLUMNS * CELL_SIZE_PX;
    const height = GRID_ROWS * CELL_SIZE_PX;
    const areaWidth = Math.max(0, window.innerWidth - SIDEBAR_WIDTH);
    return {
        x: SIDEBAR_WIDTH + Math.max(0, (areaWidth - width) / 2),
        y: Math.max(0, (window.innerHeight - height) / 2),
        width,
        height,
        cell: CELL_SIZE_PX,
    };
}

function hits(bounds: Bounds, x: number, y: number): boolean {
    return x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height;
}

function cellAt(grid: GridGeometry, x: number, y: number): { x: number; y: number } | null {
    if (!hits({ x: grid.x, y: grid.y, width: grid.width, height: grid.height }, x, y)) {
        return null;
    }
    return {
        x: Math.floor((x - grid.x) / grid.cell),
        y: Math.floor((y - grid.y) / grid.cell),
    };
}

function drawTileSprite(
    tile: BaseTile,
    cellX: number,
    cellY: number,
    grid: GridGeometry,
    zIndex: number,
    alpha = 1,
    color?: string,
): void {
    const scale = grid.cell / TILE_SIZE_PX;
    const x = grid.x + (cellX + tile.width / 2) * grid.cell;
    const y = grid.y + (cellY + tile.height / 2) * grid.cell;
    drawSprite({
        sprite: tile.tileSprite,
        x,
        y,
        scaleX: scale,
        scaleY: scale,
        zIndex,
        alpha,
        color,
    });

    // turret sits on top of the base, in the same pixel scale
    if (tile.turretSprite) {
        drawSprite({
            sprite: tile.turretSprite,
            x,
            y,
            scaleX: scale,
            scaleY: scale,
            zIndex: zIndex + 1,
            alpha,
            color,
        });
    }
}

export function updateVehicleEditor(state: GameState): void {
    const mouse = getMousePosition();
    const grid = vehicleGridGeometry();
    const layout = layoutSidebar(window.innerHeight, selectedTab, TILE_CATALOG[selectedTab]);
    const hover = cellAt(grid, mouse.x, mouse.y);

    // hold right button to erase tiles under the cursor
    if (isMouseButtonDown(2) && hover) {
        const index = state.playerData.vehicle.tiles.findIndex((placed) => {
            return hover.x >= placed.x
                && hover.x < placed.x + placed.base.width
                && hover.y >= placed.y
                && hover.y < placed.y + placed.base.height;
        });
        if (index >= 0) {
            state.playerData.vehicle.tiles.splice(index, 1);
        }
    } else if (isMouseButtonDown(0)) {
        let overSidebar = false;

        // switch sidebar tab
        for (const tab of layout.tabs) {
            if (!hits(tab.bounds, mouse.x, mouse.y)) {
                continue;
            }
            selectedTab = tab.type;
            const tiles = TILE_CATALOG[selectedTab];
            const stillListed = selectedTile !== null && tiles.includes(selectedTile);
            selectedTile = stillListed ? selectedTile : tiles[0] ?? null;
            overSidebar = true;
            break;
        }

        // choose a part to place
        if (!overSidebar) {
            for (const entry of layout.entries) {
                if (!hits(entry.bounds, mouse.x, mouse.y)) {
                    continue;
                }
                selectedTile = entry.tile;
                overSidebar = true;
                break;
            }
        }

        // hold left button to paint the selected tile
        if (!overSidebar && hover && selectedTile) {
            const tileToPlace: BaseTile = selectedTile;
            const insideGrid = hover.x >= 0
                && hover.y >= 0
                && hover.x + tileToPlace.width <= GRID_COLUMNS
                && hover.y + tileToPlace.height <= GRID_ROWS;
            const blocked = state.playerData.vehicle.tiles.some((placed) => {
                return hover.x < placed.x + placed.base.width
                    && hover.x + tileToPlace.width > placed.x
                    && hover.y < placed.y + placed.base.height
                    && hover.y + tileToPlace.height > placed.y;
            });
            if (insideGrid && !blocked) {
                state.playerData.vehicle.tiles.push({
                    base: { ...tileToPlace },
                    x: hover.x,
                    y: hover.y,
                });
            }
        }
    }

    // vehicle pane
    drawRect({
        x: SIDEBAR_WIDTH,
        y: 0,
        width: Math.max(0, window.innerWidth - SIDEBAR_WIDTH),
        height: window.innerHeight,
        color: "#141820",
    });

    if (grid.y >= 36) {
        drawText({
            text: "Vehicle",
            x: grid.x,
            y: grid.y - 12,
            font: "20px sans-serif",
            color: "#d7d5cf",
            align: "left",
            baseline: "bottom",
        });
    }

    // empty grid cells
    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLUMNS; x++) {
            drawRect({
                x: grid.x + x * grid.cell,
                y: grid.y + y * grid.cell,
                width: grid.cell,
                height: grid.cell,
                color: "#232833",
            });
        }
    }

    // tiles already on the vehicle
    for (const placed of state.playerData.vehicle.tiles) {
        drawRect({
            x: grid.x + placed.x * grid.cell,
            y: grid.y + placed.y * grid.cell,
            width: placed.base.width * grid.cell,
            height: placed.base.height * grid.cell,
            color: "#2e3648",
        });
        drawTileSprite(placed.base, placed.x, placed.y, grid, 1);
    }

    // placement preview
    if (hover && selectedTile) {
        let previewColor: string | undefined;
        for (const placed of state.playerData.vehicle.tiles) {
            const overlaps = hover.x < placed.x + placed.base.width
                && hover.x + selectedTile.width > placed.x
                && hover.y < placed.y + placed.base.height
                && hover.y + selectedTile.height > placed.y;
            if (!overlaps) {
                continue;
            }
            previewColor = placed.base.tileName === selectedTile.tileName ? "#8ecbff" : "#ff5c5c";
            if (previewColor === "#ff5c5c") {
                break;
            }
        }

        drawTileSprite(selectedTile, hover.x, hover.y, grid, 3, 0.45, previewColor);
    }

    // grid lines
    for (let y = 0; y < GRID_ROWS; y++) {
        for (let x = 0; x < GRID_COLUMNS; x++) {
            strokeRect({
                x: grid.x + x * grid.cell + 0.5,
                y: grid.y + y * grid.cell + 0.5,
                width: grid.cell,
                height: grid.cell,
                color: "#3a4254",
            });
        }
    }

    drawBuildingSidebar(
        layoutSidebar(window.innerHeight, selectedTab, TILE_CATALOG[selectedTab]),
        selectedTile,
    );
}
