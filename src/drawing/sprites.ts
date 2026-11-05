import { getCanvasContext, getDrawClip, type DrawClip } from "./canvas";

const spriteModules = import.meta.glob("../../assets/sprites/**/*.{png,jpg,jpeg,webp,gif}", {
    eager: true,
    query: "?url",
    import: "default",
});

const loadedSprites = new Map<string, HTMLImageElement>();
const missingSprites = new Set<string>();

type QueuedSprite = {
    sprite: string;
    x: number;
    y: number;
    zIndex: number;
    scaleX: number;
    scaleY: number;
    rotationRad: number;
    /** Source-pixel point that stays on x, y. Null uses the image center. */
    originX: number | null;
    originY: number | null;
    alpha: number;
    color?: string;
    white: number;
    /** Second silhouette drawn over the sprite, after the white flash. */
    cover: { color: string; amount: number } | null;
    clip: DrawClip | null;
};

let tintCanvas: HTMLCanvasElement | null = null;
let tintContext: CanvasRenderingContext2D | null = null;

const queuedSprites: QueuedSprite[] = [];
const foregroundSprites: QueuedSprite[] = [];

export function loadSprites(): Promise<void> {
    // load every image under assets/sprites, including nested folders
    const loads = Object.entries(spriteModules).map(([path, url]) => {
        const marker = "assets/sprites/";
        const start = path.lastIndexOf(marker);
        const relative = start >= 0 ? path.slice(start + marker.length) : path;
        const name = relative.replace(/\.[^.]+$/, "");

        const image = new Image();
        image.src = String(url);
        return image.decode().then(() => {
            loadedSprites.set(name, image);
        }).catch(() => {
            console.warn(`Failed to load sprite: ${name}`);
        });
    });

    return Promise.all(loads).then(() => undefined);
}

export interface DrawCommand {
    sprite: string;
    x: number;
    y: number;
    zIndex?: number;
    scaleX?: number;
    scaleY?: number;
    rotationRad?: number;
    /** Rotation pivot in the sprite's own pixels. Defaults to the image center. */
    originX?: number;
    originY?: number;
    /** 0 is invisible, 1 is opaque. */
    alpha?: number;
    /** Recolors the sprite while keeping its shape. */
    color?: string;
    /** Covers the sprite with solid white. 0 leaves it alone, 1 hides the normal color. */
    white?: number;
    /** Covers the sprite with this color, the same way `white` covers it with white. */
    cover?: { color: string; amount: number };
    /** Drawn after circles, so it stays on top of a range ring. */
    foreground?: boolean;
}

export function drawSprite({
    sprite,
    x,
    y,
    zIndex = 0,
    scaleX = 1,
    scaleY = 1,
    rotationRad = 0,
    originX,
    originY,
    alpha = 1,
    color,
    white = 0,
    cover,
    foreground = false,
}: DrawCommand) {
    const queued: QueuedSprite = {
        sprite,
        x,
        y,
        zIndex,
        scaleX,
        scaleY,
        rotationRad,
        originX: originX ?? null,
        originY: originY ?? null,
        alpha,
        color,
        white,
        cover: cover && cover.amount > 0 ? cover : null,
        clip: getDrawClip(),
    };
    if (foreground) {
        foregroundSprites.push(queued);
    } else {
        queuedSprites.push(queued);
    }
}

export function getSpriteSize(sprite: string): { width: number; height: number } | null {
    const image = loadedSprites.get(sprite);
    if (!image) {
        return null;
    }
    return { width: image.width, height: image.height };
}

export function getSpriteImage(sprite: string): HTMLImageElement | null {
    return loadedSprites.get(sprite) ?? null;
}

/** Paint sprites queued by drawSprite. Lower zIndex is drawn first. */
export function renderSprites(): void {
    paintSpriteList(queuedSprites.splice(0));
}

/** Icons queued with `foreground` so they paint after range circles. */
export function renderForegroundSprites(): void {
    paintSpriteList(foregroundSprites.splice(0));
}

function paintSpriteList(draws: QueuedSprite[]): void {
    draws.sort((a, b) => a.zIndex - b.zIndex);

    const context = getCanvasContext();
    context.imageSmoothingEnabled = false;
    for (const draw of draws) {
        const image = loadedSprites.get(draw.sprite);
        if (!image) {
            if (!missingSprites.has(draw.sprite)) {
                missingSprites.add(draw.sprite);
                console.warn(`Missing sprite: ${draw.sprite}`);
            }
            continue;
        }

        // the pivot pixel stays on x, y while the sprite rotates
        context.save();
        if (draw.clip) {
            context.beginPath();
            context.rect(draw.clip.x, draw.clip.y, draw.clip.width, draw.clip.height);
            context.clip();
        }
        context.translate(draw.x, draw.y);
        context.rotate(draw.rotationRad);
        context.scale(draw.scaleX, draw.scaleY);
        context.globalAlpha = draw.alpha;
        const pivotX = draw.originX ?? image.width / 2;
        const pivotY = draw.originY ?? image.height / 2;

        if (draw.color) {
            // tint the sprite and keep its shape
            if (!tintCanvas || !tintContext) {
                tintCanvas = document.createElement("canvas");
                tintContext = tintCanvas.getContext("2d");
            }
            if (tintContext) {
                tintCanvas.width = image.width;
                tintCanvas.height = image.height;
                tintContext.imageSmoothingEnabled = false;
                tintContext.globalCompositeOperation = "source-over";
                tintContext.drawImage(image, 0, 0);
                tintContext.globalCompositeOperation = "source-in";
                tintContext.fillStyle = draw.color;
                tintContext.fillRect(0, 0, image.width, image.height);
                tintContext.globalCompositeOperation = "multiply";
                tintContext.drawImage(image, 0, 0);
                
                context.globalCompositeOperation = "source-over";
                context.drawImage(tintCanvas, -pivotX, -pivotY);
                context.globalCompositeOperation = "source-over";

            }
        } else {
            context.drawImage(image, -pivotX, -pivotY);
        }

        if (draw.white > 0) {
            paintSilhouette(context, image, pivotX, pivotY, draw.alpha * draw.white, "#ffffff");
        }
        if (draw.cover) {
            paintSilhouette(context, image, pivotX, pivotY, draw.alpha * draw.cover.amount, draw.cover.color);
        }

        context.restore();
    }
}

function paintSilhouette(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    pivotX: number,
    pivotY: number,
    alpha: number,
    color: string,
): void {
    if (alpha <= 0) {
        return;
    }
    if (!tintCanvas || !tintContext) {
        tintCanvas = document.createElement("canvas");
        tintContext = tintCanvas.getContext("2d");
    }
    if (!tintContext) {
        return;
    }
    tintCanvas.width = image.width;
    tintCanvas.height = image.height;
    tintContext.imageSmoothingEnabled = false;
    tintContext.globalCompositeOperation = "source-over";
    tintContext.drawImage(image, 0, 0);
    tintContext.globalCompositeOperation = "source-in";
    tintContext.fillStyle = color;
    tintContext.fillRect(0, 0, image.width, image.height);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = alpha;
    context.drawImage(tintCanvas, -pivotX, -pivotY);
}
