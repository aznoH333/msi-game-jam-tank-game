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

/** Limit later drawRect, drawSprite, and drawText calls to this rectangle. */
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
}

export function drawRect({
    x,
    y,
    width,
    height,
    color,
    zIndex = 0,
}: DrawRectCommand): void {
    queuedRects.push({ x, y, width, height, color, zIndex, stroke: false, lineWidth: 0, clip: activeClip });
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
    queuedRects.push({ x, y, width, height, color, zIndex, stroke: true, lineWidth, clip: activeClip });
}

/** Paint rectangles queued by drawRect and strokeRect. Lower zIndex is drawn first. */
export function renderRects(): void {
    const draws = queuedRects.splice(0);
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
        } else {
            context.fillStyle = draw.color;
            context.fillRect(draw.x, draw.y, draw.width, draw.height);
        }
        context.restore();
    }
}
