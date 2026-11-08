import { stopEngine } from "../audio/audio";
import { drawStillStreet } from "../combat/travel";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, strokeRect } from "../drawing/canvas";
import { drawText, measureText } from "../drawing/text";
import { getMousePosition, isMouseButtonDown } from "../input/input";
import { CHARS_PER_SECOND, stopDialog } from "../ui/textCard";
import { startNewGame, switchGameState } from "./gameState";
import { returnToMainMenu } from "./mainMenu";

const INTRO_TEXT = "A black sun appeared in the sky, causing everyone to go mad. Only a few survived. Lucky is stuck in the middle of a city. Help him build a tank to escape.";
const OUTRO_TEXT = "Lucky’s tank bursts through the last barricade, leaving the ruined city behind. Beneath the black sun, the road stretches into the wasteland. But for the first time, the guns fall silent. Lucky made it out alive, thanks to you. Thanks for playing!";

const BOX_WIDTH = 1100;
const TEXT_FONT = "28px sans-serif";
const TEXT_LINE = 40;
const TEXT_PAD = 28;
const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 64;
const BUTTON_GAP = 28;

type StoryKind = "intro" | "outro";

let kind: StoryKind = "intro";
let shown = 0;
let lastMs = 0;
let leftWasDown = false;
let armed = false;

/** Story page after New Game. Continue opens the first shop. */
export function openIntro(): void {
    beginStory("intro");
    switchGameState("INTRO_SCREEN");
}

/** Story page after the final boss. Continue returns to the title. */
export function openOutro(): void {
    beginStory("outro");
    stopEngine();
    switchGameState("OUTRO_SCREEN");
}

/** Intro or outro, sharing the still street and the typed story. */
export function storyScreenUpdate(): void {
    const now = performance.now();
    const dt = lastMs === 0 ? 0 : Math.min(0.05, Math.max(0, (now - lastMs) / 1000));
    lastMs = now;
    const text = kind === "intro" ? INTRO_TEXT : OUTRO_TEXT;
    shown = Math.min(text.length, shown + dt * CHARS_PER_SECOND);

    const leftDown = isMouseButtonDown(0);
    if (!armed) {
        leftWasDown = leftDown;
        armed = true;
    }
    const leftPressed = leftDown && !leftWasDown;
    leftWasDown = leftDown;
    const mouse = getMousePosition();

    drawStillStreet({ x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT });
    const box = textBox(text);
    drawRect({
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        color: "#1b1f2a",
    });
    strokeRect({
        x: box.x + 1,
        y: box.y + 1,
        width: box.width - 2,
        height: box.height - 2,
        color: "#e6c07b",
        lineWidth: 2,
    });
    const revealed = text.slice(0, Math.floor(shown));
    const lines = wrapText(revealed, TEXT_FONT, box.width - TEXT_PAD * 2);
    let lineY = box.y + TEXT_PAD;
    for (const line of lines) {
        drawText({
            text: line,
            x: box.x + TEXT_PAD,
            y: lineY,
            font: TEXT_FONT,
            color: "#eceae4",
            align: "left",
            baseline: "top",
        });
        lineY += TEXT_LINE;
    }

    const button = {
        x: GAME_WIDTH / 2 - BUTTON_WIDTH / 2,
        y: box.y + box.height + BUTTON_GAP,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
    };
    const hovered = hits(button, mouse);
    drawRect({
        x: button.x,
        y: button.y,
        width: button.width,
        height: button.height,
        color: hovered ? "#37b24d" : "#2f9e44",
    });
    drawText({
        text: "Continue",
        x: button.x + button.width / 2,
        y: button.y + button.height / 2,
        font: "28px sans-serif",
        color: "#f4fff6",
        align: "center",
        baseline: "middle",
    });

    if (leftPressed && hovered) {
        armed = false;
        if (kind === "intro") {
            startNewGame();
        } else {
            returnToMainMenu();
        }
    }
}

function beginStory(next: StoryKind): void {
    kind = next;
    shown = 0;
    lastMs = 0;
    leftWasDown = false;
    armed = false;
    stopDialog();
}

function textBox(text: string): { x: number; y: number; width: number; height: number } {
    const lines = wrapText(text, TEXT_FONT, BOX_WIDTH - TEXT_PAD * 2);
    const height = TEXT_PAD * 2 + Math.max(1, lines.length) * TEXT_LINE;
    return {
        x: (GAME_WIDTH - BOX_WIDTH) / 2,
        y: (GAME_HEIGHT - height - BUTTON_GAP - BUTTON_HEIGHT) / 2,
        width: BOX_WIDTH,
        height,
    };
}

function wrapText(text: string, font: string, maxWidth: number): string[] {
    if (text.length === 0) {
        return [];
    }
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        const next = line.length === 0 ? word : `${line} ${word}`;
        if (measureText(next, font) <= maxWidth) {
            line = next;
            continue;
        }
        if (line.length > 0) {
            lines.push(line);
        }
        line = word;
    }
    if (line.length > 0) {
        lines.push(line);
    }
    return lines;
}

function hits(bounds: { x: number; y: number; width: number; height: number }, mouse: { x: number; y: number }): boolean {
    return mouse.x >= bounds.x && mouse.y >= bounds.y && mouse.x < bounds.x + bounds.width && mouse.y < bounds.y + bounds.height;
}
