import { clearCanvas, fitCanvasToView, initCanvas, renderCircles, renderOverlayRects, renderRects } from "./drawing/canvas";
import { render3D } from "./drawing/3d";
import { loadSprites, renderSprites } from "./drawing/sprites";
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
    renderText();
    requestAnimationFrame(loop);
}

void loadSprites().then(() => {
    requestAnimationFrame(loop);
});
