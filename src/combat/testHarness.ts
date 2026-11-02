import type { BaseVehicle } from "../building/types/vehicle";
import {
    combatSnapshot,
    createBattle,
    stepBattle,
    tileWorldCenter,
    type Battle,
    type CombatState,
    type CombatantOrders,
} from "./battle";

export type CombatSide = "player" | "enemy";

export interface CombatAction {
    fire?: { gun: number; at: { x: number; y: number } };
    repair?: { at: { x: number; y: number } };
}

interface ScheduledAction extends CombatAction {
    time: number;
    side: CombatSide;
    done: boolean;
}

/**
 * A scripted fight. Both tanks act only when the script says so.
 * `run` steps the combat simulation and returns who is left standing.
 */
export interface CombatMatch {
    /** World center of a tile, used as an aim point. */
    tile(side: CombatSide, index: number): { x: number; y: number };
    /** Order a tank at this time, in seconds from the start of the fight. */
    at(time: number, side: CombatSide, action: CombatAction): CombatMatch;
    /** Step the fight until this many seconds have passed. */
    run(seconds: number, dt?: number): CombatState;
    /** The fight as it stands, without stepping further. */
    state(): CombatState;
}

export function combatMatch(player: BaseVehicle, enemy: BaseVehicle): CombatMatch {
    const battle: Battle = createBattle(player, enemy);
    const actions: ScheduledAction[] = [];
    const match: CombatMatch = {
        tile(side, index) {
            return tileWorldCenter(battle, side, index);
        },
        at(time, side, action) {
            actions.push({ time, side, done: false, ...action });
            return match;
        },
        run(seconds, dt = 0.05) {
            const steps = Math.round(seconds / dt);
            for (let step = 0; step < steps; step++) {
                const due = actions.filter((action) => {
                    return !action.done
                        && action.time >= battle.time - 1e-8
                        && action.time < battle.time + dt - 1e-8;
                });
                for (const action of due) {
                    action.done = true;
                }
                stepBattle(battle, dt, {
                    player: ordersFor(due, "player"),
                    enemy: ordersFor(due, "enemy"),
                    enemyAi: false,
                });
            }
            return combatSnapshot(battle);
        },
        state() {
            return combatSnapshot(battle);
        },
    };
    return match;
}

function ordersFor(due: ScheduledAction[], side: CombatSide): CombatantOrders | null {
    const mine = due.filter((action) => action.side === side);
    if (mine.length === 0) {
        return null;
    }
    if (mine.length > 1) {
        throw new Error(`More than one ${side} action falls in the same step`);
    }
    const action = mine[0];
    return {
        gun: action.fire?.gun ?? null,
        target: action.fire?.at ?? null,
        repair: action.repair?.at ?? null,
    };
}
