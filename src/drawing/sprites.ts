export function loadSprites() {
    // TODO
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
    // TODO
}