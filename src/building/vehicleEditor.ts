import { playSound } from "../audio/audio";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, setDrawClip, strokeRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { drawText, measureText } from "../drawing/text";
import type { GameState } from "../game/gameState";
import { transitionToNextEvent } from "../gamedirector/gamedirector";
import { consumeWheelDelta, getMousePosition, isMouseButtonDown } from "../input/input";
import { drawAbilityBarMoney } from "../combat/abilityBar";
import { buyOffer } from "./itemShop";
import { drawBuildingSidebar, drawWeaponSlotOffer, layoutSidebar, SIDEBAR_WIDTH, weaponSlotOfferBounds, type Bounds, type EditorTab } from "../ui/buildingSidebar";
import { drawItemShop, layoutItemShop } from "../ui/itemShopPanel";
import { drawOverclockPanel, layoutOverclockCards } from "../ui/overclockPanel";
import { continueWithTutorialCard, dialogBlocksPlayer, notifyTutorialPlacement, shopActionAllowed, tutorialPlacementMustAttach } from "../ui/textCard";
import { DETAILS_SIDEBAR_WIDTH, drawVehicleDetailsSidebar, updateVehicleNameInput } from "../ui/vehicleDetailsSidebar";
import { TILE_CATALOG } from "./constants/tileCatalog";
import { serializeVehicle } from "./vehicleSave";
import { adjustOverclock, modulesInTile } from "./vehicleUtils";
import { brokenVehicleRules, buyWeaponSlot, canAddWeapon, nextWeaponSlotPrice, placedWeaponCount, type VehicleRuleFailure } from "./vehicleRules";
import { TANK_TRACK_SPRITE, tankTrackColumns } from "./tankTracks";
import { TILE_SIZE_PX, tileSpriteAt, type BaseTile, type PlacedTile, type TileType } from "./types/tiles";
import type { BaseVehicle } from "./types/vehicle";

const GRID_COLUMNS = 32;
const GRID_ROWS = 32;
const CELL_SIZE_PX = 40;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.5;
const CAMERA_MARGIN_CELLS = 12;
const CAMERA_SLACK_CELLS = 2;
const CHEAT_NAME = "bingulus fungulus";
const CHEAT_MONEY = 100_000_000;

interface GridGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    cell: number;
}

let selectedTab: EditorTab = "BLOCK";
let selectedTile: BaseTile | null = TILE_CATALOG.BLOCK[0] ?? null;
let selectedOverclockTile: PlacedTile | null = null;
let editorLeftWasDown = false;
let editorPrimed = false;
let zoom = 1;
let cameraX = 0;
let cameraY = 0;
let cameraCentered = false;
let panning = false;
let middleWasDown = false;
let panX = 0;
let panY = 0;
let cheatGranted = false;

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

function goButtonBounds(paneWidth: number): Bounds {
    return {
        x: SIDEBAR_WIDTH + paneWidth - 140,
        y: GAME_HEIGHT - 76,
        width: 120,
        height: 52,
    };
}

function copyButtonBounds(paneWidth: number): Bounds {
    return {
        x: SIDEBAR_WIDTH + paneWidth - 140,
        y: 48,
        width: 120,
        height: 40,
    };
}

function drawLaunchControl(launch: Bounds, failures: VehicleRuleFailure[]): void {
    const ready = failures.length === 0;
    drawRect({
        x: launch.x,
        y: launch.y,
        width: launch.width,
        height: launch.height,
        color: ready ? "#2f9e44" : "#2a3040",
    });
    drawText({
        text: "GO",
        x: launch.x + launch.width / 2,
        y: launch.y + launch.height / 2,
        font: "22px sans-serif",
        color: ready ? "#f4fff6" : "#8b919c",
        align: "center",
        baseline: "middle",
    });

    const font = "16px sans-serif";
    for (let index = 0; index < failures.length; index++) {
        const text = failures[index].explanation;
        const width = measureText(text, font) + 24;
        const height = 28;
        const x = launch.x + launch.width - width;
        const y = launch.y - 8 - (failures.length - index) * (height + 6);
        drawRect({
            x,
            y,
            width,
            height,
            color: "#3a2428",
        });
        drawText({
            text,
            x: x + width - 12,
            y: y + height / 2,
            font,
            color: "#f0a198",
            align: "right",
            baseline: "middle",
        });
    }
}

function copyVehicleJson(vehicle: BaseVehicle): void {
    const json = JSON.stringify(serializeVehicle(vehicle));
    const clipboard = navigator.clipboard;
    if (!clipboard) {
        return;
    }
    void clipboard.writeText(json);
}

function cellAt(grid: GridGeometry, x: number, y: number): { x: number; y: number } | null {
    if (x < SIDEBAR_WIDTH || x >= GAME_WIDTH - DETAILS_SIDEBAR_WIDTH || !hits({ x: grid.x, y: grid.y, width: grid.width, height: grid.height }, x, y)) {
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

function placeSound(type: TileType): string {
    if (type === "WEAPON") {
        return "building/weapon_place";
    }
    if (type === "UTILITY") {
        return "building/utility_place";
    }
    return "building/block_place";
}

function drawTileSprite(
    tile: BaseTile,
    tileX: number,
    tileY: number,
    centerX: number,
    centerY: number,
    scale: number,
    zIndex: number,
    alpha = 1,
    color?: string,
): void {
    drawSprite({
        sprite: tileSpriteAt(tile.tileSprite, tileX, tileY),
        x: centerX,
        y: centerY,
        scaleX: scale,
        scaleY: scale,
        zIndex,
        alpha,
        color,
    });

    // turret sits on top of the base, pivoted on its sprite center
    if (tile.turret) {
        drawSprite({
            sprite: tile.turret.turretSprite,
            x: centerX,
            y: centerY,
            scaleX: scale,
            scaleY: scale,
            originX: tile.turret.spriteCenterX,
            originY: tile.turret.spriteCenterY,
            zIndex: zIndex + 1,
            alpha,
            color,
        });
    }
}

function isTileTab(tab: EditorTab): tab is TileType {
    return tab === "WEAPON" || tab === "UTILITY" || tab === "BLOCK";
}

/** Edge contact joins the new part. A shared corner does not. */
function placementTouchesVehicle(tiles: PlacedTile[], origin: { x: number; y: number }, tile: BaseTile): boolean {
    if (tiles.length === 0) {
        return true;
    }
    return tiles.some((placed) => {
        const overlapX = Math.min(origin.x + tile.width, placed.x + placed.base.width) - Math.max(origin.x, placed.x);
        const overlapY = Math.min(origin.y + tile.height, placed.y + placed.base.height) - Math.max(origin.y, placed.y);
        return overlapX >= 0 && overlapY >= 0 && (overlapX > 0 || overlapY > 0);
    });
}

export function updateVehicleEditor(state: GameState): void {
    const mouse = getMousePosition();
    const wheel = consumeWheelDelta();
    const paneWidth = Math.max(0, GAME_WIDTH - SIDEBAR_WIDTH - DETAILS_SIDEBAR_WIDTH);
    const paneHeight = GAME_HEIGHT;
    const overVehicle = mouse.x >= SIDEBAR_WIDTH && mouse.x < GAME_WIDTH - DETAILS_SIDEBAR_WIDTH && mouse.y >= 0;
    if (shopActionAllowed("name")) {
        updateVehicleNameInput(state.playerData.vehicle);
    }
    const cheatEnabled = state.playerData.vehicle.name === CHEAT_NAME;
    if (cheatEnabled && !cheatGranted) {
        state.playerData.money = CHEAT_MONEY;
    }
    cheatGranted = cheatEnabled;

    // start centered on the build grid
    if (!cameraCentered) {
        cameraCentered = true;
        const cell = CELL_SIZE_PX * zoom;
        cameraX = SIDEBAR_WIDTH + paneWidth / 2 - (GRID_COLUMNS / 2) * cell;
        cameraY = GAME_HEIGHT / 2 - (GRID_ROWS / 2) * cell;
    }

    // drag the camera with the middle mouse button
    if (!shopActionAllowed("camera")) {
        panning = false;
        middleWasDown = isMouseButtonDown(1);
    } else if (isMouseButtonDown(1)) {
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
    if (shopActionAllowed("camera") && wheel !== 0 && overVehicle) {
        const previousCell = CELL_SIZE_PX * zoom;
        const worldX = (mouse.x - cameraX) / previousCell;
        const worldY = (mouse.y - cameraY) / previousCell;
        zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.pow(0.999, wheel)));
        const nextCell = CELL_SIZE_PX * zoom;
        cameraX = mouse.x - worldX * nextCell;
        cameraY = mouse.y - worldY * nextCell;
    }

    // keep the view center from wandering away from the vehicle
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
    const catalogTiles = isTileTab(selectedTab) ? TILE_CATALOG[selectedTab] : [];
    const layout = layoutSidebar(GAME_HEIGHT, selectedTab, catalogTiles);
    const hover = cellAt(grid, mouse.x, mouse.y);
    const leftDown = isMouseButtonDown(0);
    if (!editorPrimed) {
        editorLeftWasDown = leftDown;
        editorPrimed = true;
    }
    const leftPressed = leftDown && !editorLeftWasDown;
    const goButton = goButtonBounds(paneWidth);
    const copyButton = copyButtonBounds(paneWidth);
    const weaponSlots = state.playerData.vehicleWeaponSlots;
    if (shopActionAllowed("go") && leftPressed && brokenVehicleRules(state.playerData.vehicle, weaponSlots).length === 0 && hits(goButton, mouse.x, mouse.y)) {
        continueWithTutorialCard();
        transitionToNextEvent();
    }
    const copyClicked = shopActionAllowed("copy") && cheatEnabled && leftPressed && hits(copyButton, mouse.x, mouse.y);
    if (copyClicked) {
        copyVehicleJson(state.playerData.vehicle);
    }
    if (
        selectedOverclockTile
        && !state.playerData.vehicle.tiles.includes(selectedOverclockTile)
    ) {
        selectedOverclockTile = null;
    }

    // hold right button to erase tiles under the cursor
    if (shopActionAllowed("erase") && !panning && isTileTab(selectedTab) && isMouseButtonDown(2) && hover) {
        const index = state.playerData.vehicle.tiles.findIndex((placed) => {
            return hover.x >= placed.x
                && hover.x < placed.x + placed.base.width
                && hover.y >= placed.y
                && hover.y < placed.y + placed.base.height;
        });
        if (index >= 0) {
            const removed = state.playerData.vehicle.tiles[index];
            state.playerData.money += removed.base.price;
            state.playerData.overclockModules += modulesInTile(removed);
            state.playerData.vehicle.tiles.splice(index, 1);
            playSound("building/tile_remove");
        }
    } else if (!dialogBlocksPlayer() && !panning && leftDown && !copyClicked) {
        let overSidebar = false;

        // switch sidebar tab
        for (const tab of layout.tabs) {
            if (!hits(tab.bounds, mouse.x, mouse.y)) {
                continue;
            }
            overSidebar = true;
            if (shopActionAllowed("tab", tab.type)) {
                selectedTab = tab.type;
                if (isTileTab(selectedTab)) {
                    const tiles = TILE_CATALOG[selectedTab];
                    const stillListed = selectedTile !== null && tiles.includes(selectedTile);
                    selectedTile = stillListed ? selectedTile : tiles[0] ?? null;
                }
            }
            break;
        }

        if (selectedTab === "ITEMS") {
            if (shopActionAllowed("buy") && leftPressed && !overSidebar) {
                const row = layoutItemShop(state.playerData).find((entry) => hits(entry.bounds, mouse.x, mouse.y));
                if (row) {
                    buyOffer(state.playerData, row.offer);
                }
            }
        } else if (selectedTab === "OVERCLOCK") {
            const cards = layoutOverclockCards(selectedOverclockTile);
            if (shopActionAllowed("overclock") && leftPressed) {
                const plus = cards.find((card) => hits(card.plus, mouse.x, mouse.y));
                const minus = cards.find((card) => hits(card.minus, mouse.x, mouse.y));
                const stepped = plus ?? minus;
                const instance = stepped && selectedOverclockTile
                    ? selectedOverclockTile.overclocks[stepped.index]
                    : undefined;
                if (stepped && instance) {
                    const adjusted = adjustOverclock(instance, plus ? 1 : -1, state.playerData.overclockModules);
                    if (adjusted) {
                        instance.value = adjusted.value;
                        state.playerData.overclockModules = adjusted.modules;
                    }
                } else if (!overSidebar && hover) {
                    const turret = state.playerData.vehicle.tiles.find((placed) => {
                        return hover.x >= placed.x
                            && hover.x < placed.x + placed.base.width
                            && hover.y >= placed.y
                            && hover.y < placed.y + placed.base.height
                            && placed.base.turret !== undefined
                            && placed.base.turret.overClocks.length > 0;
                    });
                    selectedOverclockTile = turret ?? null;
                }
            }
        } else {
            if (selectedTab === "WEAPON" && shopActionAllowed("weapon-slot") && leftPressed && !overSidebar && hits(weaponSlotOfferBounds(), mouse.x, mouse.y)) {
                buyWeaponSlot(state.playerData);
                overSidebar = true;
            }

            // choose a part to place
            if (!overSidebar) {
                for (const entry of layout.entries) {
                    if (!hits(entry.bounds, mouse.x, mouse.y)) {
                        continue;
                    }
                    overSidebar = true;
                    if (shopActionAllowed("place", entry.tile.type)) {
                        selectedTile = entry.tile;
                    }
                    break;
                }
            }

            // hold left button to paint the tile centered on the cursor
            if (!overSidebar && !hits(goButton, mouse.x, mouse.y) && hover && selectedTile) {
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
                const weaponAllowed = tileToPlace.type !== "WEAPON" || canAddWeapon(state.playerData.vehicle, state.playerData.vehicleWeaponSlots);
                const attached = !tutorialPlacementMustAttach() || placementTouchesVehicle(state.playerData.vehicle.tiles, origin, tileToPlace);
                if (shopActionAllowed("place", tileToPlace.type) && insideGrid && !blocked && weaponAllowed && attached && state.playerData.money >= tileToPlace.price) {
                    state.playerData.money -= tileToPlace.price;
                    state.playerData.vehicle.tiles.push({
                        base: { ...tileToPlace },
                        x: origin.x,
                        y: origin.y,
                        overclocks: (tileToPlace.turret?.overClocks ?? []).map((slider) => ({
                            base: slider,
                            value: slider.baseValue,
                        })),
                    });
                    playSound(placeSound(tileToPlace.type));
                    notifyTutorialPlacement(tileToPlace);
                }
            }
        }
    }

    editorLeftWasDown = leftDown;

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
    const lastColumn = Math.min(GRID_COLUMNS - 1, Math.floor((SIDEBAR_WIDTH + paneWidth - grid.x - 0.001) / grid.cell));
    const firstRow = Math.max(0, Math.floor((0 - grid.y) / grid.cell));
    const lastRow = Math.min(GRID_ROWS - 1, Math.floor((GAME_HEIGHT - grid.y - 0.001) / grid.cell));
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

    const trackScale = grid.cell / TILE_SIZE_PX;
    for (const track of tankTrackColumns(state.playerData.vehicle.tiles.map((placed) => ({
        x: placed.x,
        y: placed.y,
        width: placed.base.width,
        height: placed.base.height,
    })))) {
        for (let step = 0; step < track.length; step++) {
            drawSprite({
                sprite: TANK_TRACK_SPRITE,
                x: grid.x + (track.x + 0.5) * grid.cell,
                y: grid.y + (track.y + step + 0.5) * grid.cell,
                scaleX: trackScale,
                scaleY: trackScale,
                zIndex: 0,
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
            placed.x,
            placed.y,
            grid.x + (placed.x + placed.base.width / 2) * grid.cell,
            grid.y + (placed.y + placed.base.height / 2) * grid.cell,
            grid.cell / TILE_SIZE_PX,
            1,
        );
    }

    // placement preview sits on the grid cells the cursor-centered tile would occupy
    if (isTileTab(selectedTab) && hover && selectedTile) {
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
        const slotsFull = selectedTile.type === "WEAPON" && !canAddWeapon(state.playerData.vehicle, state.playerData.vehicleWeaponSlots);
        if (previewColor !== "#ff5c5c" && (slotsFull || state.playerData.money < selectedTile.price)) {
            previewColor = "#ff5c5c";
        }

        drawTileSprite(
            selectedTile,
            origin.x,
            origin.y,
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

    // mark turrets that can be overclocked, and the one currently selected
    if (selectedTab === "OVERCLOCK") {
        for (const placed of state.playerData.vehicle.tiles) {
            if (!placed.base.turret || placed.base.turret.overClocks.length === 0) {
                continue;
            }
            strokeRect({
                x: grid.x + placed.x * grid.cell + 1,
                y: grid.y + placed.y * grid.cell + 1,
                width: placed.base.width * grid.cell - 2,
                height: placed.base.height * grid.cell - 2,
                color: placed === selectedOverclockTile ? "#e6c07b" : "#8ecbff",
                lineWidth: 2,
            });
        }
    }

    setDrawClip(null);
    drawBuildingSidebar(layout, selectedTile);
    if (selectedTab === "WEAPON") {
        const slotPrice = nextWeaponSlotPrice(state.playerData.vehicleWeaponSlots);
        drawWeaponSlotOffer(slotPrice, state.playerData.money >= slotPrice);
    }
    if (selectedTab === "ITEMS") {
        drawItemShop(state.playerData);
    }
    if (selectedTab === "OVERCLOCK") {
        drawOverclockPanel(selectedOverclockTile, state.playerData.overclockModules);
    }
    drawVehicleDetailsSidebar(
        state.playerData.vehicle,
        selectedTile,
        selectedTab === "OVERCLOCK" ? selectedOverclockTile : undefined,
    );
    drawAbilityBarMoney(
        state.playerData.money,
        state.playerData.overclockModules,
        placedWeaponCount(state.playerData.vehicle),
        state.playerData.vehicleWeaponSlots,
    );

    drawLaunchControl(goButtonBounds(paneWidth), brokenVehicleRules(state.playerData.vehicle, state.playerData.vehicleWeaponSlots));

    if (!cheatEnabled) {
        return;
    }
    drawText({
        text: "cheat mode enabled",
        x: SIDEBAR_WIDTH + paneWidth - 16,
        y: 24,
        font: "18px sans-serif",
        color: "#ff5c5c",
        align: "right",
        baseline: "middle",
    });
    drawRect({
        x: copyButton.x,
        y: copyButton.y,
        width: copyButton.width,
        height: copyButton.height,
        color: "#8f2d2d",
    });
    drawText({
        text: "Copy",
        x: copyButton.x + copyButton.width / 2,
        y: copyButton.y + copyButton.height / 2,
        font: "18px sans-serif",
        color: "#fff4f4",
        align: "center",
        baseline: "middle",
    });
}
