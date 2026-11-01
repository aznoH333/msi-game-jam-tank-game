import { clearCanvas, initCanvas, renderRects } from "./drawing/canvas";
import { loadSprites, renderSprites } from "./drawing/sprites";
import { renderText } from "./drawing/text";
import { getGameState, updateGame } from "./game/gameState";

initCanvas();

function loop(): void {
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
