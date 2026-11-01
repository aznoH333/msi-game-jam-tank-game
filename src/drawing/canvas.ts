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
