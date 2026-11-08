import { loadSounds } from "./audio/audio";
import titleFontUrl from "../assets/fonts/RussoOne-Regular.ttf";
import { clearCanvas, fitCanvasToView, initCanvas, renderCircles, renderOverlayRects, renderRects, renderScreenFade } from "./drawing/canvas";
import { render3D } from "./drawing/3d";
import { loadSprites, renderForegroundSprites, renderSprites } from "./drawing/sprites";
import { renderText } from "./drawing/text";
import { getGameState, updateGame } from "./game/gameState";
import { startInput } from "./input/input";

initCanvas();
startInput();

function loop(): void {
    fitCanvasToView();
    clearCanvas();
    updateGame(getGameState());
    render3D();
    renderRects();
    renderSprites();
    renderOverlayRects();
    renderCircles();
    renderForegroundSprites();
    renderText();
    renderScreenFade();
    requestAnimationFrame(loop);
}

void Promise.all([loadSprites(), loadSounds(), loadTitleFont()]).then(() => {
    requestAnimationFrame(loop);
});

async function loadTitleFont(): Promise<void> {
    const face = new FontFace("Russo One", `url(${titleFontUrl})`);
    await face.load();
    document.fonts.add(face);
}
