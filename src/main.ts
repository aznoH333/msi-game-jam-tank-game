import { clearCanvas, initCanvas } from "./drawing/canvas";
import { loadSprites, renderSprites } from "./drawing/sprites";
import { getGameState, updateGame } from "./game/gameState";

initCanvas();

function loop(): void {
    clearCanvas();
    updateGame(getGameState());
    renderSprites();
    requestAnimationFrame(loop);
}

void loadSprites().then(() => {
    requestAnimationFrame(loop);
});
