import { drawRect } from "../drawing/canvas";
import { drawSprite } from "../drawing/sprites";
import { driverIsTalking, driverTalkingMouthOpen } from "./textCard";

const IDLE_SPRITE = "ui/lucky_idle";
const BLINK_SPRITE = "ui/lucky_idle_blink";
const SAD_SPRITE = "ui/lucky_sad";
const HURT_SPRITE = "ui/lucky_hurt";
const TALKING_SPRITE = "ui/lucky_talking";

const FACE_SIZE = 48;

const HURT_SECONDS = 0.5;
const BLINK_SECONDS = 0.14;
const BLINK_GAP_MIN = 2.6;
const BLINK_GAP_MAX = 5.4;
/** A hit that removes at least this share of max health flashes the background red. */
const BIG_HIT = 0.05;
const RED_FLASH_SECONDS = 0.35;
const SAD_HEALTH = 0.5;
const LOW_HEALTH = 0.35;
/** Full on/off cycle of the low-health red blink. */
const LOW_BLINK_PERIOD = 0.6;
const PORTRAIT_GRAY = "#141013";
const PORTRAIT_RED = "210, 42, 36";
const SHAKE_SCALE = 0.45;
const SHAKE_LIMIT = 8;

let clockReady = false;
let nextBlink = 0;
let blinkUntil = 0;
let hurtUntil = 0;
let redUntil = 0;
let lastRatio: number | null = null;

export interface DriverPortraitState {
    /** Share of the vehicle's hit points still left. */
    healthRatio: number;
    /** Player-view screenshake, in screen pixels. */
    shakeX: number;
    shakeY: number;
}

/** Gray portrait box. The face follows health, hits, and the player view's shake. */
export function drawDriverPortrait(x: number, y: number, size: number, state: DriverPortraitState): void {
    const now = performance.now() / 1000;
    if (!clockReady) {
        clockReady = true;
        nextBlink = now + blinkGap();
        lastRatio = state.healthRatio;
    }

    if (lastRatio !== null && state.healthRatio < lastRatio - 1e-4) {
        hurtUntil = now + HURT_SECONDS;
        if (lastRatio - state.healthRatio >= BIG_HIT) {
            redUntil = now + RED_FLASH_SECONDS;
        }
    }
    lastRatio = state.healthRatio;

    if (now >= nextBlink) {
        blinkUntil = now + BLINK_SECONDS;
        nextBlink = blinkUntil + blinkGap();
    }

    const dx = Math.round(clamp(state.shakeX * SHAKE_SCALE, -SHAKE_LIMIT, SHAKE_LIMIT));
    const dy = Math.round(clamp(state.shakeY * SHAKE_SCALE, -SHAKE_LIMIT, SHAKE_LIMIT));
    const boxX = x + dx;
    const boxY = y + dy;

    drawRect({
        x: boxX,
        y: boxY,
        width: size,
        height: size,
        color: PORTRAIT_GRAY,
    });
    const red = backgroundRed(state.healthRatio, now);
    if (red > 0) {
        drawRect({
            x: boxX,
            y: boxY,
            width: size,
            height: size,
            color: `rgba(${PORTRAIT_RED}, ${red})`,
        });
    }
    const scale = size / FACE_SIZE;
    drawSprite({
        sprite: faceSprite(state.healthRatio, now),
        x: boxX + size / 2,
        y: boxY + size / 2,
        scaleX: scale,
        scaleY: scale,
    });
}

function faceSprite(healthRatio: number, now: number): string {
    if (driverIsTalking()) {
        return driverTalkingMouthOpen() ? TALKING_SPRITE : IDLE_SPRITE;
    }
    if (now < hurtUntil) {
        return HURT_SPRITE;
    }
    if (healthRatio < SAD_HEALTH) {
        return SAD_SPRITE;
    }
    if (now < blinkUntil) {
        return BLINK_SPRITE;
    }
    return IDLE_SPRITE;
}

function backgroundRed(healthRatio: number, now: number): number {
    let red = 0;
    if (healthRatio < LOW_HEALTH) {
        red = Math.floor(now / (LOW_BLINK_PERIOD / 2)) % 2 === 0 ? 1 : 0;
    }
    if (now < redUntil) {
        red = Math.max(red, (redUntil - now) / RED_FLASH_SECONDS);
    }
    return red;
}

function blinkGap(): number {
    return BLINK_GAP_MIN + Math.random() * (BLINK_GAP_MAX - BLINK_GAP_MIN);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
