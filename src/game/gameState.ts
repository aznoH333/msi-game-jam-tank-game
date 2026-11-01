import { buildingScreenUpdate } from "./buildingScreen";
import { combatScreenUpdate } from "./combatScreen";
import { mainMenuUpdate } from "./mainMenu";
import { PlayerData, initPlayerData } from "./playerData";


export type GameScreen = "MAIN_MENU" | "BUILDING_SCREEN" | "COMBAT_SCREEN";

export interface GameState {
    currentScreen: GameScreen;
    playerData: PlayerData;
};




export function initGame(): GameState {
    // initializes new game
    return {
        currentScreen: "BUILDING_SCREEN",
        playerData: initPlayerData(),
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
    }
}

