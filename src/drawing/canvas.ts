export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

let canvasElement: HTMLCanvasElement | null = null;
let activeContext: CanvasRenderingContext2D | null = null;
let appliedViewWidth = -1;
let appliedViewHeight = -1;
let appliedDpr = -1;

/** Keep a 16:9 frame fitted inside the window, with black bars outside it. */
export function fitCanvasToView(): void {
    if (!canvasElement || !activeContext) {
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    if (viewWidth === appliedViewWidth && viewHeight === appliedViewHeight && dpr === appliedDpr) {
        return;
    }
    appliedViewWidth = viewWidth;
    appliedViewHeight = viewHeight;
    appliedDpr = dpr;

    const bitmapWidth = Math.floor(GAME_WIDTH * dpr);
    const bitmapHeight = Math.floor(GAME_HEIGHT * dpr);
    if (canvasElement.width !== bitmapWidth || canvasElement.height !== bitmapHeight) {
        canvasElement.width = bitmapWidth;
        canvasElement.height = bitmapHeight;
        activeContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // largest 16:9 rectangle that fits, centered in the leftover space
    const scale = Math.min(viewWidth / GAME_WIDTH, viewHeight / GAME_HEIGHT);
    const displayWidth = GAME_WIDTH * scale;
    const displayHeight = GAME_HEIGHT * scale;
    canvasElement.style.width = `${displayWidth}px`;
    canvasElement.style.height = `${displayHeight}px`;
    canvasElement.style.left = `${(viewWidth - displayWidth) / 2}px`;
    canvasElement.style.top = `${(viewHeight - displayHeight) / 2}px`;
}

export function initCanvas(): void {
    const element = document.querySelector<HTMLCanvasElement>("#game");
    if (!element) {
        throw new Error("Missing #game canvas");
    }

    const renderingContext = element.getContext("2d");
    if (!renderingContext) {
        throw new Error("2D canvas is unavailable");
    }

    canvasElement = element;
    activeContext = renderingContext;
    fitCanvasToView();
    window.addEventListener("resize", fitCanvasToView);
}

/** Map a browser pixel into the fixed 1920×1080 game frame. */
export function clientToGame(clientX: number, clientY: number): { x: number; y: number } {
    if (!canvasElement) {
        return { x: clientX, y: clientY };
    }
    const rect = canvasElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return { x: clientX, y: clientY };
    }
    return {
        x: (clientX - rect.left) * (GAME_WIDTH / rect.width),
        y: (clientY - rect.top) * (GAME_HEIGHT / rect.height),
    };
}

/** Match the game frame's bitmap and screen rectangle. Used by the WebGL canvas behind it. */
export function mirrorGameCanvas(target: HTMLCanvasElement): void {
    if (!canvasElement) {
        return;
    }
    target.style.left = canvasElement.style.left;
    target.style.top = canvasElement.style.top;
    target.style.width = canvasElement.style.width;
    target.style.height = canvasElement.style.height;
    if (target.width !== canvasElement.width || target.height !== canvasElement.height) {
        target.width = canvasElement.width;
        target.height = canvasElement.height;
    }
}

export function getCanvasContext(): CanvasRenderingContext2D {
    if (!activeContext) {
        throw new Error("Canvas is not initialized");
    }
    return activeContext;
}

export function clearCanvas(): void {
    const context = getCanvasContext();

    // fill the frame with the background color
    context.fillStyle = "#111318";
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}

export interface DrawClip {
    x: number;
    y: number;
    width: number;
    height: number;
}

let activeClip: DrawClip | null = null;

/** Limit later drawRect, drawCircle, drawSprite, and drawText calls to this rectangle. */
export function setDrawClip(clip: DrawClip | null): void {
    activeClip = clip;
}

export function getDrawClip(): DrawClip | null {
    return activeClip;
}

interface QueuedRect {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    zIndex: number;
    rotationRad: number;
    stroke: boolean;
    lineWidth: number;
    clip: DrawClip | null;
}

const queuedRects: QueuedRect[] = [];

export interface DrawRectCommand {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    zIndex?: number;
    /** Radians around the rectangle center. Zero stays axis-aligned. */
    rotationRad?: number;
}

export function drawRect({
    x,
    y,
    width,
    height,
    color,
    zIndex = 0,
    rotationRad = 0,
}: DrawRectCommand): void {
    queuedRects.push({
        x,
        y,
        width,
        height,
        color,
        zIndex,
        rotationRad,
        stroke: false,
        lineWidth: 0,
        clip: activeClip,
    });
}

export interface StrokeRectCommand {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    lineWidth?: number;
    zIndex?: number;
}

export function strokeRect({
    x,
    y,
    width,
    height,
    color,
    lineWidth = 1,
    zIndex = 0,
}: StrokeRectCommand): void {
    queuedRects.push({ x, y, width, height, color, zIndex, rotationRad: 0, stroke: true, lineWidth, clip: activeClip });
}

interface QueuedCircle {
    x: number;
    y: number;
    radius: number;
    color: string;
    strokeColor: string;
    lineWidth: number;
    zIndex: number;
    clip: DrawClip | null;
}

const queuedCircles: QueuedCircle[] = [];

export interface DrawCircleCommand {
    x: number;
    y: number;
    /** Radius in screen pixels. */
    radius: number;
    color: string;
    strokeColor?: string;
    lineWidth?: number;
    zIndex?: number;
}

export function drawCircle({
    x,
    y,
    radius,
    color,
    strokeColor = color,
    lineWidth = 2,
    zIndex = 0,
}: DrawCircleCommand): void {
    if (!(radius > 0)) {
        return;
    }
    queuedCircles.push({
        x,
        y,
        radius,
        color,
        strokeColor,
        lineWidth,
        zIndex,
        clip: activeClip,
    });
}

/** Paint circles queued by drawCircle. Lower zIndex is drawn first. */
export function renderCircles(): void {
    const draws = queuedCircles.splice(0);
    draws.sort((a, b) => a.zIndex - b.zIndex);

    const context = getCanvasContext();
    for (const draw of draws) {
        context.save();
        if (draw.clip) {
            context.beginPath();
            context.rect(draw.clip.x, draw.clip.y, draw.clip.width, draw.clip.height);
            context.clip();
        }
        context.beginPath();
        context.arc(draw.x, draw.y, draw.radius, 0, Math.PI * 2);
        context.fillStyle = draw.color;
        context.fill();
        context.strokeStyle = draw.strokeColor;
        context.lineWidth = draw.lineWidth;
        context.stroke();
        context.restore();
    }
}

function paintRects(draws: QueuedRect[]): void {
    draws.sort((a, b) => a.zIndex - b.zIndex);
    const context = getCanvasContext();
    for (const draw of draws) {
        context.save();
        if (draw.clip) {
            context.beginPath();
            context.rect(draw.clip.x, draw.clip.y, draw.clip.width, draw.clip.height);
            context.clip();
        }
        if (draw.stroke) {
            context.strokeStyle = draw.color;
            context.lineWidth = draw.lineWidth;
            context.strokeRect(draw.x, draw.y, draw.width, draw.height);
        } else if (draw.rotationRad !== 0) {
            context.translate(draw.x + draw.width / 2, draw.y + draw.height / 2);
            context.rotate(draw.rotationRad);
            context.fillStyle = draw.color;
            context.fillRect(-draw.width / 2, -draw.height / 2, draw.width, draw.height);
        } else {
            context.fillStyle = draw.color;
            context.fillRect(draw.x, draw.y, draw.width, draw.height);
        }
        context.restore();
    }
}

/** Paint rectangles at zIndex 0 and below. These sit under sprites. */
export function renderRects(): void {
    const pending = queuedRects.splice(0);
    const under: QueuedRect[] = [];
    for (const draw of pending) {
        if (draw.zIndex > 0) {
            queuedRects.push(draw);
        } else {
            under.push(draw);
        }
    }
    paintRects(under);
}

/** Paint rectangles queued above zIndex 0. Call this after sprites. */
export function renderOverlayRects(): void {
    paintRects(queuedRects.splice(0));
}

let screenFade = 0;

/** Cover the frame with black. 0 leaves the picture alone. */
export function setScreenFade(alpha: number): void {
    screenFade = Math.min(1, Math.max(0, alpha));
}

/** Paint the black cover after every other layer, including the 3D view. */
export function renderScreenFade(): void {
    if (screenFade <= 0) {
        return;
    }
    const context = getCanvasContext();
    context.save();
    context.fillStyle = `rgba(0, 0, 0, ${screenFade})`;
    context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    context.restore();
}
