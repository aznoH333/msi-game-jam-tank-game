import { getCanvasContext } from "./canvas";

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
};

const queuedSprites: QueuedSprite[] = [];

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
}

export function drawSprite({
    sprite,
    x,
    y,
    zIndex = 0,
    scaleX = 1,
    scaleY = 1,
    rotationRad = 0,
}: DrawCommand) {
    queuedSprites.push({ sprite, x, y, zIndex, scaleX, scaleY, rotationRad });
}

/** Paint sprites queued by drawSprite. Lower zIndex is drawn first. */
export function renderSprites(): void {
    const draws = queuedSprites.splice(0);
    draws.sort((a, b) => a.zIndex - b.zIndex);

    const context = getCanvasContext();
    for (const draw of draws) {
        const image = loadedSprites.get(draw.sprite);
        if (!image) {
            if (!missingSprites.has(draw.sprite)) {
                missingSprites.add(draw.sprite);
                console.warn(`Missing sprite: ${draw.sprite}`);
            }
            continue;
        }

        // draw the sprite centered on x, y
        context.save();
        context.translate(draw.x, draw.y);
        context.rotate(draw.rotationRad);
        context.scale(draw.scaleX, draw.scaleY);
        context.drawImage(image, -image.width / 2, -image.height / 2);
        context.restore();
    }
}
