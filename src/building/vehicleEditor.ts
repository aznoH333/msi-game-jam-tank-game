import { drawRect, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import type { GameState } from "../game/gameState";
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
let cursorX = -1;
let cursorY = -1;
let inputInstalled = false;

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
    sprite: string,
    cellX: number,
    cellY: number,
    width: number,
    height: number,
    grid: GridGeometry,
    zIndex: number,
    alpha = 1,
    color?: string,
): void {
    const scale = grid.cell / TILE_SIZE_PX;
    drawSprite({
        sprite,
        x: grid.x + (cellX + width / 2) * grid.cell,
        y: grid.y + (cellY + height / 2) * grid.cell,
        scaleX: scale,
        scaleY: scale,
        zIndex,
        alpha,
        color,
    });
}

export function installVehicleEditorInput(getState: () => GameState): void {
    if (inputInstalled) {
        return;
    }
    inputInstalled = true;

    window.addEventListener("pointermove", (event) => {
        cursorX = event.clientX;
        cursorY = event.clientY;
    });

    window.addEventListener("contextmenu", (event) => {
        if (getState().currentScreen === "BUILDING_SCREEN") {
            event.preventDefault();
        }
    });

    window.addEventListener("pointerdown", (event) => {
        const state = getState();
        if (state.currentScreen !== "BUILDING_SCREEN") {
            return;
        }

        const layout = layoutSidebar(window.innerHeight, selectedTab, TILE_CATALOG[selectedTab]);

        // switch sidebar tab
        for (const tab of layout.tabs) {
            if (!hits(tab.bounds, event.clientX, event.clientY)) {
                continue;
            }
            selectedTab = tab.type;
            const tiles = TILE_CATALOG[selectedTab];
            const stillListed = selectedTile !== null && tiles.includes(selectedTile);
            selectedTile = stillListed ? selectedTile : tiles[0] ?? null;
            return;
        }

        // choose a part to place
        for (const entry of layout.entries) {
            if (!hits(entry.bounds, event.clientX, event.clientY)) {
                continue;
            }
            selectedTile = entry.tile;
            return;
        }

        const grid = vehicleGridGeometry();
        const cell = cellAt(grid, event.clientX, event.clientY);
        if (!cell) {
            return;
        }

        const vehicle = state.playerData.vehicle;

        // remove the tile under the cursor
        if (event.button === 2) {
            const index = vehicle.tiles.findIndex((placed) => {
                return cell.x >= placed.x
                    && cell.x < placed.x + placed.base.width
                    && cell.y >= placed.y
                    && cell.y < placed.y + placed.base.height;
            });
            if (index >= 0) {
                vehicle.tiles.splice(index, 1);
            }
            return;
        }

        if (event.button !== 0 || !selectedTile) {
            return;
        }
        const tileToPlace: BaseTile = selectedTile;

        // reject a placement that leaves the grid or covers another tile
        const insideGrid = cell.x >= 0
            && cell.y >= 0
            && cell.x + tileToPlace.width <= GRID_COLUMNS
            && cell.y + tileToPlace.height <= GRID_ROWS;
        const blocked = vehicle.tiles.some((placed) => {
            return cell.x < placed.x + placed.base.width
                && cell.x + tileToPlace.width > placed.x
                && cell.y < placed.y + placed.base.height
                && cell.y + tileToPlace.height > placed.y;
        });
        if (!insideGrid || blocked) {
            return;
        }

        vehicle.tiles.push({
            base: { ...tileToPlace },
            x: cell.x,
            y: cell.y,
        });
    });
}

export function updateVehicleEditor(state: GameState): void {
    const grid = vehicleGridGeometry();
    const layout = layoutSidebar(window.innerHeight, selectedTab, TILE_CATALOG[selectedTab]);
    const hover = cellAt(grid, cursorX, cursorY);

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
        drawTileSprite(placed.base.tileSprite, placed.x, placed.y, placed.base.width, placed.base.height, grid, 1);
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
            previewColor = placed.base.tileSprite === selectedTile.tileSprite ? "#8ecbff" : "#ff5c5c";
            if (previewColor === "#ff5c5c") {
                break;
            }
        }

        drawTileSprite(
            selectedTile.tileSprite,
            hover.x,
            hover.y,
            selectedTile.width,
            selectedTile.height,
            grid,
            2,
            0.45,
            previewColor,
        );
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

    drawBuildingSidebar(layout, selectedTile);
}
