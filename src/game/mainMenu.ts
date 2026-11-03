import { drawRect, GAME_HEIGHT, GAME_WIDTH } from "../drawing/canvas";
import { drawText } from "../drawing/text";
import { getMousePosition, isKeyDown, isMouseButtonDown } from "../input/input";
import { startNewGame, switchGameState } from "./gameState";

const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 64;

let leftWasDown = false;
let startWasDown = false;
let armed = false;

/** Leave a run and show the title screen. */
export function returnToMainMenu(): void {
    armed = false;
    switchGameState("MAIN_MENU");
}

/** Title screen. New Game replaces the current run and opens the first shop. */
export function mainMenuUpdate(): void {
    const mouse = getMousePosition();
    const leftDown = isMouseButtonDown(0);
    const startDown = isKeyDown("Enter") || isKeyDown("Space");
    if (!armed) {
        leftWasDown = leftDown;
        startWasDown = startDown;
        armed = true;
    }
    const leftPressed = leftDown && !leftWasDown;
    const startPressed = startDown && !startWasDown;
    leftWasDown = leftDown;
    startWasDown = startDown;

    drawRect({
        x: 0,
        y: 0,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        color: "#141820",
    });
    drawText({
        text: "Tank Game",
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT / 2 - 120,
        font: "72px sans-serif",
        color: "#eceae4",
        align: "center",
        baseline: "middle",
    });

    const button = {
        x: GAME_WIDTH / 2 - BUTTON_WIDTH / 2,
        y: GAME_HEIGHT / 2,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
    };
    const hovered = mouse.x >= button.x
        && mouse.y >= button.y
        && mouse.x < button.x + button.width
        && mouse.y < button.y + button.height;
    drawRect({
        x: button.x,
        y: button.y,
        width: button.width,
        height: button.height,
        color: hovered ? "#37b24d" : "#2f9e44",
    });
    drawText({
        text: "New Game",
        x: button.x + button.width / 2,
        y: button.y + button.height / 2,
        font: "28px sans-serif",
        color: "#f4fff6",
        align: "center",
        baseline: "middle",
    });

    if (startPressed || (leftPressed && hovered)) {
        startNewGame();
    }
}
