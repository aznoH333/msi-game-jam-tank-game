import { getCanvasContext, getDrawClip, type DrawClip } from "./canvas";

interface QueuedText {
    text: string;
    x: number;
    y: number;
    font: string;
    color: string;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;
    zIndex: number;
    clip: DrawClip | null;
}

const queuedText: QueuedText[] = [];

export interface DrawTextCommand {
    text: string;
    x: number;
    y: number;
    font?: string;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    zIndex?: number;
}

export function drawText({
    text,
    x,
    y,
    font = "16px sans-serif",
    color = "#eceae4",
    align = "left",
    baseline = "middle",
    zIndex = 0,
}: DrawTextCommand): void {
    queuedText.push({ text, x, y, font, color, align, baseline, zIndex, clip: getDrawClip() });
}

export function measureText(text: string, font = "16px sans-serif"): number {
    const context = getCanvasContext();
    context.font = font;
    return context.measureText(text).width;
}

/** Paint text queued by drawText. Lower zIndex is drawn first. */
export function renderText(): void {
    const draws = queuedText.splice(0);
    draws.sort((a, b) => a.zIndex - b.zIndex);

    const context = getCanvasContext();
    for (const draw of draws) {
        context.save();
        if (draw.clip) {
            context.beginPath();
            context.rect(draw.clip.x, draw.clip.y, draw.clip.width, draw.clip.height);
            context.clip();
        }
        context.font = draw.font;
        context.fillStyle = draw.color;
        context.textAlign = draw.align;
        context.textBaseline = draw.baseline;
        context.fillText(draw.text, draw.x, draw.y);
        context.restore();
    }
}
