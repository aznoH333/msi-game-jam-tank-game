import type { BaseVehicle } from "../../building/types/vehicle";

export interface EnemyCatalogRecord {
    fileName: string;
    earliestAppearance: number;
    latestAppearance: number;
}

const enemyVehicleFiles = import.meta.glob("../../../assets/enemies/*.json", {
    eager: true,
    import: "default",
}) as Record<string, BaseVehicle>;


export const ENEMY_CATALOG: EnemyCatalogRecord[] = [
    {
        fileName: "small_1.json",
        earliestAppearance: 0,
        latestAppearance: 99,

    },
    {
        fileName: "small_2.json",
        earliestAppearance: 1,
        latestAppearance: 99,
    },
    {
        fileName: "medium_1.json",
        earliestAppearance: 3,
        latestAppearance: 99,

    }

];

/** A catalog tank whose appearance range includes this event. */
export function pickEnemyVehicle(eventIndex: number): BaseVehicle {
    const available = ENEMY_CATALOG.filter((record) => {
        return eventIndex >= record.earliestAppearance && eventIndex <= record.latestAppearance;
    });
    const record = available[Math.floor(Math.random() * available.length)];
    if (!record) {
        throw new Error(`No enemy is available at event ${eventIndex}`);
    }
    const vehicle = Object.entries(enemyVehicleFiles).find(([path]) => path.endsWith(`/${record.fileName}`))?.[1];
    if (!vehicle) {
        throw new Error(`Missing enemy file ${record.fileName}`);
    }
    return vehicle;
}