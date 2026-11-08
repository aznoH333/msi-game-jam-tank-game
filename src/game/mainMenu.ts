import { stopEngine } from "../audio/audio";
import { drawStillStreet } from "../combat/travel";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, gameToClient } from "../drawing/canvas";
import { drawText } from "../drawing/text";
import { getMousePosition, isKeyDown, isMouseButtonDown } from "../input/input";
import { discardRun, resumeSavedRun, switchGameState } from "./gameState";
import { hasSavedRun } from "./save";
import { screenFadeAlpha } from "./screenTransition";
import { openIntro } from "./storyScreen";

const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 64;
const BUTTON_GAP = 16;
const TITLE = "ARMORED EXODUS";
const TITLE_FONT = "92px \"Russo One\", sans-serif";
const REPO_URL = "https://github.com/aznoH333/msi-game-jam-tank-game";

let leftWasDown = false;
let startWasDown = false;
let armed = false;
let repoLink: HTMLAnchorElement | null = null;

/** Leave a run and show the title screen. */
export function returnToMainMenu(): void {
    armed = false;
    stopEngine();
    switchGameState("MAIN_MENU");
}

/** Title screen. Play resumes a stored run, or opens the intro when there is none. */
export function mainMenuUpdate(): void {
    stopEngine();
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

    drawStillStreet({ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT });

    const play = {
        x: GAME_WIDTH / 2 - BUTTON_WIDTH / 2,
        y: GAME_HEIGHT / 2,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
    };
    const reset = {
        x: play.x,
        y: play.y + BUTTON_HEIGHT + BUTTON_GAP,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
    };
    const titleY = play.y - 88;
    drawText({
        text: TITLE,
        x: GAME_WIDTH / 2 + 5,
        y: titleY + 6,
        font: TITLE_FONT,
        color: "#140c08",
        align: "center",
        baseline: "middle",
    });
    drawText({
        text: TITLE,
        x: GAME_WIDTH / 2,
        y: titleY,
        font: TITLE_FONT,
        color: "#f3efe4",
        align: "center",
        baseline: "middle",
    });
    drawButton(play, "Play", hits(play, mouse) ? "#37b24d" : "#2f9e44", "#f4fff6");
    drawButton(reset, "Reset", hits(reset, mouse) ? "#a33b45" : "#8a3038", "#f4fff6");
    placeRepoLink();

    if (leftPressed && hits(reset, mouse)) {
        discardRun();
        return;
    }
    if (startPressed || (leftPressed && hits(play, mouse))) {
        if (!hasSavedRun() || !resumeSavedRun()) {
            openIntro();
        }
    }
}

/** The repository link only belongs on the title screen. */
export function hideRepoLink(): void {
    if (repoLink) {
        repoLink.style.display = "none";
    }
}

function placeRepoLink(): void {
    const link = repoAnchor();
    const point = gameToClient(GAME_WIDTH / 2, GAME_HEIGHT - 40);
    const fade = screenFadeAlpha();
    link.style.display = "block";
    link.style.left = `${point.x}px`;
    link.style.top = `${point.y}px`;
    link.style.opacity = String(1 - fade);
    link.style.pointerEvents = fade > 0.9 ? "none" : "auto";
}

function repoAnchor(): HTMLAnchorElement {
    if (repoLink) {
        return repoLink;
    }
    const link = document.createElement("a");
    link.href = REPO_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = REPO_URL;
    link.style.position = "fixed";
    link.style.transform = "translate(-50%, -50%)";
    link.style.zIndex = "5";
    link.style.color = "#d6e8ff";
    link.style.font = "20px sans-serif";
    link.style.textDecoration = "underline";
    link.style.textShadow = "-1px 0 #140c08, 1px 0 #140c08, 0 -1px #140c08, 0 1px #140c08";
    link.style.whiteSpace = "nowrap";
    document.body.appendChild(link);
    repoLink = link;
    return link;
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
