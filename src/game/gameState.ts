import { setMusic } from "../audio/audio";
import { setScreenFade } from "../drawing/canvas";
import { beginAttempt, GameDirector, initGameDirector } from "../gamedirector/gamedirector";
import { buildingScreenUpdate } from "./buildingScreen";
import { combatScreenUpdate } from "./combatScreen";
import { explorationScreenUpdate } from "./explorationScreen";
import { gameOverUpdate } from "./gameOver";
import { logoScreenUpdate } from "./logoScreen";
import { hideRepoLink, mainMenuUpdate } from "./mainMenu";
import { PlayerData, initPlayerData } from "./playerData";
import { clearSavedRun, isSavedScreen, loadSavedRun, writeSavedRun } from "./save";
import { isScreenTransitionIdle, requestTransition, screenFadeAlpha, updateScreenTransition } from "./screenTransition";
import { storyScreenUpdate } from "./storyScreen";
import { activeDialogId, playQueuedTrashTutorial, resetTutorialProgress, restoreTutorialProgress, startDialogChain, stopDialog, tutorialProgress, updateDialog } from "../ui/textCard";


export type GameScreen = "LOGO_SCREEN" | "MAIN_MENU" | "INTRO_SCREEN" | "OUTRO_SCREEN" | "BUILDING_SCREEN" | "COMBAT_SCREEN" | "EXPLORATION_SCREEN" | "GAME_OVER_SCREEN";

export interface GameState {
    currentScreen: GameScreen;
    playerData: PlayerData;
    gameDirector: GameDirector;
};




export function initGame(): GameState {
    // initializes new game
    return {
        currentScreen: "LOGO_SCREEN",
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
    updateScreenTransition();
    if (isScreenTransitionIdle()) {
        playQueuedTrashTutorial();
    }
    if (activeDialogId() === "combat_tutorial") {
        const fighting = state.currentScreen === "COMBAT_SCREEN" && state.gameDirector.currentEventType === "COMBAT";
        if (!fighting) {
            stopDialog();
        }
    }
    setMusic(musicFor(state));
    switch (state.currentScreen) {
        
        case "LOGO_SCREEN":
            logoScreenUpdate();
            break;

        case "MAIN_MENU":
            mainMenuUpdate();
            break;

        case "INTRO_SCREEN":
        case "OUTRO_SCREEN":
            storyScreenUpdate();
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
    if (state.currentScreen !== "MAIN_MENU") {
        hideRepoLink();
    }
    updateDialog();
    if (isSavedScreen(state.currentScreen)) {
        writeSavedRun(state.playerData, state.gameDirector, state.currentScreen, tutorialProgress());
    }
    setScreenFade(screenFadeAlpha());
}

function musicFor(state: GameState): string | null {
    if (
        state.currentScreen === "MAIN_MENU"
        || state.currentScreen === "INTRO_SCREEN"
        || state.currentScreen === "OUTRO_SCREEN"
        || state.currentScreen === "BUILDING_SCREEN"
    ) {
        return "music/building_music";
    }
    if (state.currentScreen === "COMBAT_SCREEN" && state.gameDirector.currentEventType === "TRAVEL") {
        return "music/travel_music";
    }
    if (state.currentScreen === "COMBAT_SCREEN") {
        return "music/combat_music";
    }
    return null;
}

/** Replace the run and open the first shop. */
export function startNewGame(): void {
    requestTransition(() => {
        beginAttempt();
        const state = getGameState();
        state.playerData = initPlayerData();
        state.gameDirector = initGameDirector();
        state.currentScreen = "BUILDING_SCREEN";
        resetTutorialProgress();
        startDialogChain("shop_dialog_1");
    });
}

/** Open the stored run on the screen it was left on. */
export function resumeSavedRun(): boolean {
    const saved = loadSavedRun();
    if (!saved) {
        return false;
    }
    requestTransition(() => {
        beginAttempt();
        const state = getGameState();
        state.playerData = saved.player;
        state.gameDirector = saved.director;
        state.currentScreen = saved.screen;
        restoreTutorialProgress(saved.tutorials);
        stopDialog();
    });
    return true;
}

/** Drop the stored run so the next Play starts from the intro. */
export function discardRun(): void {
    clearSavedRun();
    const state = getGameState();
    state.playerData = initPlayerData();
    state.gameDirector = initGameDirector();
    resetTutorialProgress();
    stopDialog();
}

export function switchGameState(newState: GameScreen) {
    requestTransition(() => {
        getGameState().currentScreen = newState;
    });
}
