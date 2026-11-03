import { beginAttempt, GameDirector, initGameDirector } from "../gamedirector/gamedirector";
import { buildingScreenUpdate } from "./buildingScreen";
import { combatScreenUpdate } from "./combatScreen";
import { explorationScreenUpdate } from "./explorationScreen";
import { gameOverUpdate } from "./gameOver";
import { mainMenuUpdate } from "./mainMenu";
import { PlayerData, initPlayerData } from "./playerData";


export type GameScreen = "MAIN_MENU" | "BUILDING_SCREEN" | "COMBAT_SCREEN" | "EXPLORATION_SCREEN" | "GAME_OVER_SCREEN";

export interface GameState {
    currentScreen: GameScreen;
    playerData: PlayerData;
    gameDirector: GameDirector;
};




export function initGame(): GameState {
    // initializes new game
    return {
        currentScreen: "MAIN_MENU",
        playerData: initPlayerData(),
        gameDirector: initGameDirector(),
    };
}


/**
 * Global state is an omniscient object that holds the entire game state.
 */
const globalState: GameState = initGame();


/** Get the current game state */
export function getGameState(): GameState {
    return globalState;
}



export function updateGame(state: GameState) {
    switch (state.currentScreen) {
        
        case "MAIN_MENU":
            mainMenuUpdate();
            break;

        case "BUILDING_SCREEN":
            buildingScreenUpdate();
            break;

        case "COMBAT_SCREEN":
            combatScreenUpdate();
            break;

        case "EXPLORATION_SCREEN":
            explorationScreenUpdate();
            break;

        case "GAME_OVER_SCREEN":
            gameOverUpdate();
            break;
    }
}

/** Replace the run and open the first shop. */
export function startNewGame(): void {
    beginAttempt();
    const state = getGameState();
    state.playerData = initPlayerData();
    state.gameDirector = initGameDirector();
    state.currentScreen = "BUILDING_SCREEN";
}

export function switchGameState(newState: GameScreen) {
    const state = getGameState();
    state.currentScreen = newState;
}
