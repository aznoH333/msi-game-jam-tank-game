import type { BaseVehicle } from "../../building/types/vehicle";
import { vehicleFromSave, type SavedVehicle } from "../../building/vehicleSave";

export interface EnemyCatalogRecord {
    fileName: string;
    earliestAppearance: number;
    latestAppearance: number;
    moneyDropped: number;
}

export interface PickedEnemy {
    vehicle: BaseVehicle;
    moneyDropped: number;
}


const enemyVehicleFiles = import.meta.glob("../../../assets/enemies/*.json", {
    eager: true,
    import: "default",
}) as Record<string, SavedVehicle>;


export const ENEMY_CATALOG: EnemyCatalogRecord[] = [
    
    
    { // intro enemy
        fileName: "small_1.json",
        earliestAppearance: 0,
        latestAppearance: 3,
        moneyDropped: 500,

    },
    { // t1
        fileName: "t1_small_2.json",
        earliestAppearance: 1,
        latestAppearance: 10,
        moneyDropped: 2000,
    },
    {
        fileName: "t1_cannon.json",
        earliestAppearance: 1,
        latestAppearance: 10,
        moneyDropped: 2000,
    },
    {
        fileName: "t1_medium.json",
        earliestAppearance: 3,
        latestAppearance: 10,
        moneyDropped: 3000,
    },
    { // t1 boss
        fileName: "t1_large.json",
        earliestAppearance: 11,
        latestAppearance: 11,
        moneyDropped: 4000,
    },
    
    
    { // t2
        fileName: "t2_small.json",
        earliestAppearance: 12,
        latestAppearance: 20,
        moneyDropped: 3000,
    },
    {
        fileName: "t2_mortar.json",
        earliestAppearance: 12,
        latestAppearance: 20,
        moneyDropped: 3000,
    },
    {
        fileName: "t2_gunner.json",
        earliestAppearance: 12,
        latestAppearance: 20,
        moneyDropped: 3000,
    },
    { // t2 boss
        fileName: "t2_large.json",
        earliestAppearance: 21,
        latestAppearance: 21,
        moneyDropped: 5000,
    },

    
    { // t3
        fileName: "t3_small.json",
        earliestAppearance: 22,
        latestAppearance: 30,
        moneyDropped: 4000,
    },
    { 
        fileName: "t3_small_2.json",
        earliestAppearance: 22,
        latestAppearance: 30,
        moneyDropped: 4000,
    },
    { 
        fileName: "t3_mortar.json",
        earliestAppearance: 24,
        latestAppearance: 30,
        moneyDropped: 5000,
    },
    {  // t3 boss
        fileName: "t3_large.json",
        earliestAppearance: 31,
        latestAppearance: 31,
        moneyDropped: 10000,
    },


    { // t4
        fileName: "t4_medium.json",
        earliestAppearance: 32,
        latestAppearance: 32,
        moneyDropped: 5000,
    },
    { // t4
        fileName: "t4_missile.json",
        earliestAppearance: 33,
        latestAppearance: 33,
        moneyDropped: 5000,
    },
    { // cannon brick
        fileName: "t4_cannon_brick.json",
        earliestAppearance: 34,
        latestAppearance: 34,
        moneyDropped: 5000,
    },
    
    // final boss
    {
        fileName: "final_boss.json",
        earliestAppearance: 35,
        latestAppearance: 35,
        moneyDropped: 0,

    }
];

/** A catalog tank whose appearance range includes this event. */
export function pickEnemyVehicle(eventIndex: number): PickedEnemy {
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
    return {
        vehicle: vehicleFromSave(vehicle),
        moneyDropped: record.moneyDropped,
    };
}