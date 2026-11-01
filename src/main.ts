import { clearCanvas, fitCanvasToView, initCanvas, renderRects } from "./drawing/canvas";
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
    renderRects();
    renderSprites();
    renderText();
    requestAnimationFrame(loop);
}

void loadSprites().then(() => {
    requestAnimationFrame(loop);
});
