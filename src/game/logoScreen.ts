import { drawRect, GAME_HEIGHT, GAME_WIDTH } from "../drawing/canvas";
import { drawSprite, getSpriteSize } from "../drawing/sprites";
import { drawText, measureText } from "../drawing/text";
import { isKeyDown, isMouseButtonDown } from "../input/input";
import { switchGameState } from "./gameState";

const LOGO_SPRITE = "ui/developer_logo";
const LOGO_SCALE = 4;
const FADE_SECONDS = 0.6;
const HOLD_SECONDS = 2;
const LABEL = "Made by aznoh";
const LABEL_FONT = "48px sans-serif";

let startedMs = 0;
let leftWasDown = false;
let keyWasDown = false;
let armed = false;
let leaving = false;
let fadeOutMs = 0;
let fadeOutFrom = 1;

/** Black splash at launch. Click, or wait, and the main menu opens. */
export function logoScreenUpdate(): void {
    const now = performance.now();
    if (startedMs === 0) {
        startedMs = now;
    }
    const leftDown = isMouseButtonDown(0);
    const keyDown = isKeyDown("Enter") || isKeyDown("Space") || isKeyDown("Escape");
    if (!armed) {
        leftWasDown = leftDown;
        keyWasDown = keyDown;
        armed = true;
    }
    const leftPressed = leftDown && !leftWasDown;
    const keyPressed = keyDown && !keyWasDown;
    leftWasDown = leftDown;
    keyWasDown = keyDown;

    drawRect({
        x: 0,
        y: 0,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        color: "#000000",
    });
    const held = (now - startedMs) / 1000;
    const fadeIn = Math.min(1, held / FADE_SECONDS);
    if (!leaving && fadeOutMs === 0 && (held >= FADE_SECONDS + HOLD_SECONDS || leftPressed || keyPressed)) {
        fadeOutMs = now;
        fadeOutFrom = fadeIn;
    }
    let alpha = fadeIn;
    if (fadeOutMs !== 0) {
        const out = Math.min(1, (now - fadeOutMs) / 1000 / FADE_SECONDS);
        alpha = fadeOutFrom * (1 - out);
        if (out >= 1 && !leaving) {
            leaving = true;
            switchGameState("MAIN_MENU");
        }
    }
    drawCredit(alpha);
}

function drawCredit(alpha: number): void {
    const size = getSpriteSize(LOGO_SPRITE) ?? { width: 36, height: 33 };
    const logoWidth = size.width * LOGO_SCALE;
    const textWidth = measureText(LABEL, LABEL_FONT);
    const gap = 28;
    const total = logoWidth + gap + textWidth;
    const left = (GAME_WIDTH - total) / 2;
    const midY = GAME_HEIGHT / 2;
    drawSprite({
        sprite: LOGO_SPRITE,
        x: left + logoWidth / 2,
        y: midY,
        scaleX: LOGO_SCALE,
        scaleY: LOGO_SCALE,
        alpha,
    });
    drawText({
        text: LABEL,
        x: left + logoWidth + gap,
        y: midY,
        font: LABEL_FONT,
        color: `rgba(236, 234, 228, ${alpha})`,
        align: "left",
        baseline: "middle",
    });
}
