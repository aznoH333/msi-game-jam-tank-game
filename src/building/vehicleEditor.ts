import { drawRect, setDrawClip, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText } from "../drawing/text";
import type { GameState } from "../game/gameState";
import { consumeWheelDelta, getMousePosition, isMouseButtonDown } from "../input/input";
import { drawBuildingSidebar, layoutSidebar, SIDEBAR_WIDTH, type Bounds } from "../ui/buildingSidebar";
import { TILE_CATALOG } from "./constants/tileCatalog";
import { TILE_SIZE_PX, type BaseTile, type TileType } from "./types/tiles";

const GRID_COLUMNS = 32;
const GRID_ROWS = 32;
const CELL_SIZE_PX = 40;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const CAMERA_MARGIN_CELLS = 12;
const CAMERA_SLACK_CELLS = 2;

interface GridGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    cell: number;
}

let selectedTab: TileType = "BLOCK";
let selectedTile: BaseTile | null = TILE_CATALOG.BLOCK[0] ?? null;
let zoom = 1;
let cameraX = 0;
let cameraY = 0;
let cameraCentered = false;
let panning = false;
let middleWasDown = false;
let panX = 0;
let panY = 0;

function vehicleGridGeometry(): GridGeometry {
    const cell = CELL_SIZE_PX * zoom;
    return {
        x: cameraX,
        y: cameraY,
        width: GRID_COLUMNS * cell,
        height: GRID_ROWS * cell,
        cell,
    };
}

function hits(bounds: Bounds, x: number, y: number): boolean {
    return x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height;
}

function cellAt(grid: GridGeometry, x: number, y: number): { x: number; y: number } | null {
    if (x < SIDEBAR_WIDTH || !hits({ x: grid.x, y: grid.y, width: grid.width, height: grid.height }, x, y)) {
        return null;
    }
    return {
        x: Math.floor((x - grid.x) / grid.cell),
        y: Math.floor((y - grid.y) / grid.cell),
    };
}

function placementOrigin(grid: GridGeometry, mouseX: number, mouseY: number, tile: BaseTile): { x: number; y: number } {
    return {
        x: Math.round((mouseX - grid.x) / grid.cell - tile.width / 2),
        y: Math.round((mouseY - grid.y) / grid.cell - tile.height / 2),
    };
}

function drawTileSprite(
    tile: BaseTile,
    centerX: number,
    centerY: number,
    scale: number,
    zIndex: number,
    alpha = 1,
    color?: string,
): void {
    drawSprite({
        sprite: tile.tileSprite,
        x: centerX,
        y: centerY,
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
            x: centerX,
            y: centerY,
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
    const wheel = consumeWheelDelta();
    const overVehicle = mouse.x >= SIDEBAR_WIDTH && mouse.y >= 0;

    // start centered on the build grid
    if (!cameraCentered) {
        cameraCentered = true;
        const cell = CELL_SIZE_PX * zoom;
        cameraX = SIDEBAR_WIDTH + Math.max(0, window.innerWidth - SIDEBAR_WIDTH) / 2 - (GRID_COLUMNS / 2) * cell;
        cameraY = window.innerHeight / 2 - (GRID_ROWS / 2) * cell;
    }

    // drag the camera with the middle mouse button
    if (isMouseButtonDown(1)) {
        if (!middleWasDown && overVehicle) {
            panning = true;
        }
        if (panning && middleWasDown) {
            cameraX += mouse.x - panX;
            cameraY += mouse.y - panY;
        }
        panX = mouse.x;
        panY = mouse.y;
        middleWasDown = true;
    } else {
        panning = false;
        middleWasDown = false;
    }

    // zoom toward the cursor
    if (wheel !== 0 && overVehicle) {
        const previousCell = CELL_SIZE_PX * zoom;
        const worldX = (mouse.x - cameraX) / previousCell;
        const worldY = (mouse.y - cameraY) / previousCell;
        zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.pow(0.999, wheel)));
        const nextCell = CELL_SIZE_PX * zoom;
        cameraX = mouse.x - worldX * nextCell;
        cameraY = mouse.y - worldY * nextCell;
    }

    // keep the view center from wandering away from the vehicle
    const paneWidth = Math.max(0, window.innerWidth - SIDEBAR_WIDTH);
    const paneHeight = window.innerHeight;
    const cellSize = CELL_SIZE_PX * zoom;
    const viewCenterX = SIDEBAR_WIDTH + paneWidth / 2;
    const viewCenterY = paneHeight / 2;
    let anchorMinX = GRID_COLUMNS / 2;
    let anchorMaxX = GRID_COLUMNS / 2;
    let anchorMinY = GRID_ROWS / 2;
    let anchorMaxY = GRID_ROWS / 2;
    if (state.playerData.vehicle.tiles.length > 0) {
        anchorMinX = GRID_COLUMNS;
        anchorMinY = GRID_ROWS;
        anchorMaxX = 0;
        anchorMaxY = 0;
        for (const placed of state.playerData.vehicle.tiles) {
            anchorMinX = Math.min(anchorMinX, placed.x);
            anchorMinY = Math.min(anchorMinY, placed.y);
            anchorMaxX = Math.max(anchorMaxX, placed.x + placed.base.width);
            anchorMaxY = Math.max(anchorMaxY, placed.y + placed.base.height);
        }
    }
    const minFocusX = Math.max(-CAMERA_SLACK_CELLS, anchorMinX - CAMERA_MARGIN_CELLS);
    const maxFocusX = Math.min(GRID_COLUMNS + CAMERA_SLACK_CELLS, anchorMaxX + CAMERA_MARGIN_CELLS);
    const minFocusY = Math.max(-CAMERA_SLACK_CELLS, anchorMinY - CAMERA_MARGIN_CELLS);
    const maxFocusY = Math.min(GRID_ROWS + CAMERA_SLACK_CELLS, anchorMaxY + CAMERA_MARGIN_CELLS);
    const focusX = Math.min(maxFocusX, Math.max(minFocusX, (viewCenterX - cameraX) / cellSize));
    const focusY = Math.min(maxFocusY, Math.max(minFocusY, (viewCenterY - cameraY) / cellSize));
    cameraX = viewCenterX - focusX * cellSize;
    cameraY = viewCenterY - focusY * cellSize;

    const grid = vehicleGridGeometry();
    const layout = layoutSidebar(window.innerHeight, selectedTab, TILE_CATALOG[selectedTab]);
    const hover = cellAt(grid, mouse.x, mouse.y);

    // hold right button to erase tiles under the cursor
    if (!panning && isMouseButtonDown(2) && hover) {
        const index = state.playerData.vehicle.tiles.findIndex((placed) => {
            return hover.x >= placed.x
                && hover.x < placed.x + placed.base.width
                && hover.y >= placed.y
                && hover.y < placed.y + placed.base.height;
        });
        if (index >= 0) {
            state.playerData.vehicle.tiles.splice(index, 1);
        }
    } else if (!panning && isMouseButtonDown(0)) {
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

        // hold left button to paint the tile centered on the cursor
        if (!overSidebar && hover && selectedTile) {
            const tileToPlace: BaseTile = selectedTile;
            const origin = placementOrigin(grid, mouse.x, mouse.y, tileToPlace);
            const insideGrid = origin.x >= 0
                && origin.y >= 0
                && origin.x + tileToPlace.width <= GRID_COLUMNS
                && origin.y + tileToPlace.height <= GRID_ROWS;
            const blocked = state.playerData.vehicle.tiles.some((placed) => {
                return origin.x < placed.x + placed.base.width
                    && origin.x + tileToPlace.width > placed.x
                    && origin.y < placed.y + placed.base.height
                    && origin.y + tileToPlace.height > placed.y;
            });
            if (insideGrid && !blocked) {
                state.playerData.vehicle.tiles.push({
                    base: { ...tileToPlace },
                    x: origin.x,
                    y: origin.y,
                });
            }
        }
    }

    // vehicle pane, clipped so the grid cannot paint over the sidebar
    setDrawClip({
        x: SIDEBAR_WIDTH,
        y: 0,
        width: paneWidth,
        height: paneHeight,
    });
    drawRect({
        x: SIDEBAR_WIDTH,
        y: 0,
        width: paneWidth,
        height: paneHeight,
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

    // empty grid cells that intersect the vehicle pane
    const firstColumn = Math.max(0, Math.floor((SIDEBAR_WIDTH - grid.x) / grid.cell));
    const lastColumn = Math.min(GRID_COLUMNS - 1, Math.floor((window.innerWidth - grid.x - 0.001) / grid.cell));
    const firstRow = Math.max(0, Math.floor((0 - grid.y) / grid.cell));
    const lastRow = Math.min(GRID_ROWS - 1, Math.floor((window.innerHeight - grid.y - 0.001) / grid.cell));
    for (let y = firstRow; y <= lastRow; y++) {
        for (let x = firstColumn; x <= lastColumn; x++) {
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
        drawTileSprite(
            placed.base,
            grid.x + (placed.x + placed.base.width / 2) * grid.cell,
            grid.y + (placed.y + placed.base.height / 2) * grid.cell,
            grid.cell / TILE_SIZE_PX,
            1,
        );
    }

    // placement preview sits on the grid cells the cursor-centered tile would occupy
    if (hover && selectedTile) {
        const origin = placementOrigin(grid, mouse.x, mouse.y, selectedTile);
        let previewColor: string | undefined;
        for (const placed of state.playerData.vehicle.tiles) {
            const overlaps = origin.x < placed.x + placed.base.width
                && origin.x + selectedTile.width > placed.x
                && origin.y < placed.y + placed.base.height
                && origin.y + selectedTile.height > placed.y;
            if (!overlaps) {
                continue;
            }
            previewColor = placed.base.tileName === selectedTile.tileName ? "#8ecbff" : "#ff5c5c";
            if (previewColor === "#ff5c5c") {
                break;
            }
        }

        drawTileSprite(
            selectedTile,
            grid.x + (origin.x + selectedTile.width / 2) * grid.cell,
            grid.y + (origin.y + selectedTile.height / 2) * grid.cell,
            grid.cell / TILE_SIZE_PX,
            3,
            0.45,
            previewColor,
        );
    }

    // grid lines
    for (let y = firstRow; y <= lastRow; y++) {
        for (let x = firstColumn; x <= lastColumn; x++) {
            strokeRect({
                x: grid.x + x * grid.cell + 0.5,
                y: grid.y + y * grid.cell + 0.5,
                width: grid.cell,
                height: grid.cell,
                color: "#3a4254",
            });
        }
    }

    setDrawClip(null);
    drawBuildingSidebar(
        layoutSidebar(window.innerHeight, selectedTab, TILE_CATALOG[selectedTab]),
        selectedTile,
    );
}
