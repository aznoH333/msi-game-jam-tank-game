import { stopEngine } from "../audio/audio";
import { drawRect, GAME_HEIGHT, GAME_WIDTH } from "../drawing/canvas";
import { drawText } from "../drawing/text";
import { restoreCheckpoint } from "../gamedirector/gamedirector";
import { getMousePosition, isMouseButtonDown } from "../input/input";
import { returnToMainMenu } from "./mainMenu";
import { switchGameState } from "./gameState";

const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 64;
const BUTTON_GAP = 16;

let leftWasDown = false;
let armed = false;

/** Show the game over screen. The run stays where it was until the player chooses. */
export function openGameOver(): void {
    armed = false;
    stopEngine();
    switchGameState("GAME_OVER_SCREEN");
}

/** Continue returns to the last shop. Main Menu leaves the run. */
export function gameOverUpdate(): void {
    stopEngine();
    const leftDown = isMouseButtonDown(0);
    if (!armed) {
        leftWasDown = leftDown;
        armed = true;
    }
    const leftPressed = leftDown && !leftWasDown;
    leftWasDown = leftDown;

    drawRect({
        x: 0,
        y: 0,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        color: "#141820",
    });
    drawText({
        text: "Game Over",
        x: GAME_WIDTH / 2,
        y: GAME_HEIGHT / 2 - 140,
        font: "72px sans-serif",
        color: "#f0a198",
        align: "center",
        baseline: "middle",
    });

    const mouse = getMousePosition();
    const continueButton = {
        x: GAME_WIDTH / 2 - BUTTON_WIDTH / 2,
        y: GAME_HEIGHT / 2 - BUTTON_HEIGHT / 2,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
    };
    const menuButton = {
        x: continueButton.x,
        y: continueButton.y + BUTTON_HEIGHT + BUTTON_GAP,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
    };
    const continueHovered = hits(continueButton, mouse);
    const menuHovered = hits(menuButton, mouse);
    drawButton(continueButton, "Continue", continueHovered ? "#37b24d" : "#2f9e44", "#f4fff6");
    drawButton(menuButton, "Main Menu", menuHovered ? "#3d465c" : "#2a3040", "#eceae4");

    if (!leftPressed) {
        return;
    }
    if (continueHovered) {
        armed = false;
        restoreCheckpoint();
        return;
    }
    if (menuHovered) {
        armed = false;
        returnToMainMenu();
    }
}

function hits(bounds: { x: number; y: number; width: number; height: number }, mouse: { x: number; y: number }): boolean {
    return mouse.x >= bounds.x && mouse.y >= bounds.y && mouse.x < bounds.x + bounds.width && mouse.y < bounds.y + bounds.height;
}

function drawButton(
    bounds: { x: number; y: number; width: number; height: number },
    label: string,
    color: string,
    textColor: string,
): void {
    drawRect({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        color,
    });
    drawText({
        text: label,
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        font: "28px sans-serif",
        color: textColor,
        align: "center",
        baseline: "middle",
    });
}
