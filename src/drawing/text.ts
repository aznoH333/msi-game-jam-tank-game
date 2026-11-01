import { getCanvasContext } from "./canvas";

interface QueuedText {
    text: string;
    x: number;
    y: number;
    font: string;
    color: string;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;
    zIndex: number;
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
    queuedText.push({ text, x, y, font, color, align, baseline, zIndex });
}

/** Paint text queued by drawText. Lower zIndex is drawn first. */
export function renderText(): void {
    const draws = queuedText.splice(0);
    draws.sort((a, b) => a.zIndex - b.zIndex);

    const context = getCanvasContext();
    for (const draw of draws) {
        context.font = draw.font;
        context.fillStyle = draw.color;
        context.textAlign = draw.align;
        context.textBaseline = draw.baseline;
        context.fillText(draw.text, draw.x, draw.y);
    }
}
