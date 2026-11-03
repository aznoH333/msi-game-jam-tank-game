export interface EnemyDefinition {
    sprite: string;
    name: string;
    health: number;
    /** A number in tiles per second */
    movementSpeed: number;
    /** A number in seconds. How long does the enemies action last? The enemy won't update its action until this time has passed */
    actionTime: number;
    damageMin: number;
    damageMax: number;

    /** Hitscan reach, in exploration tiles. The enemy cannot attack farther than this. */
    attackRange: number;
}




export const ENEMY_CATALOG: EnemyDefinition[] = [
    {
        sprite: "world/events/debug_event",
        name: "debug melee enemy",
        health: 30,
        movementSpeed: 0.75,
        actionTime: 0.15,
        damageMin: 10,
        damageMax: 30,
        attackRange: 0.5,
    },
    {
        sprite: "world/events/debug_event",
        name: "debug ranged enemy",
        health: 30,
        movementSpeed: 0.5,
        actionTime: 0.4,

        damageMin: 5,
        damageMax: 15,
        attackRange: 4,
    }
];