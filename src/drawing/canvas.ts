let activeContext: CanvasRenderingContext2D | null = null;

export function initCanvas(): void {
    const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
    if (!canvasElement) {
        throw new Error("Missing #game canvas");
    }

    const renderingContext = canvasElement.getContext("2d");
    if (!renderingContext) {
        throw new Error("2D canvas is unavailable");
    }

    const canvas: HTMLCanvasElement = canvasElement;
    const context: CanvasRenderingContext2D = renderingContext;

    const resize = (): void => {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    window.addEventListener("resize", resize);
    resize();
    activeContext = context;
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
    context.fillRect(0, 0, window.innerWidth, window.innerHeight);
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
