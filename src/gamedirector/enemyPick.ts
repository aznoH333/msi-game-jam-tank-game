/** One catalog row the fight picker can see. */
export interface EnemyChoice {
    fileName: string;
}

/**
 * A regular fight skips the tank from the previous fight when the pool has another.
 * A pool of one, or a boss fight, keeps the whole list.
 */
export function chooseEnemyRecord<T extends EnemyChoice>(
    pool: readonly T[],
    avoidFile: string | null,
    roll: number,
): T {
    const varied = avoidFile !== null && pool.length > 1
        ? pool.filter((record) => record.fileName !== avoidFile)
        : pool;
    const choices = varied.length > 0 ? varied : pool;
    const index = Math.min(choices.length - 1, Math.max(0, Math.floor(roll * choices.length)));
    const chosen = choices[index];
    if (!chosen) {
        throw new Error("Enemy pool is empty");
    }
    return chosen;
}
