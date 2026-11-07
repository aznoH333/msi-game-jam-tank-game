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




const TIER_1_START = 1;
const TIER_2_START = 7;
const TIER_3_START = 15;
const TIER_4_START = 20



export const ENEMY_CATALOG: EnemyCatalogRecord[] = [
    
    
    { // intro enemy
        fileName: "small_1.json",
        earliestAppearance: 0,
        latestAppearance: 2,
        moneyDropped: 2000,

    },
    { // t1
        fileName: "t1_small_2.json",
        earliestAppearance: TIER_1_START,
        latestAppearance: TIER_2_START - 2,
        moneyDropped: 2500,
    },
    {
        fileName: "t1_cannon.json",
        earliestAppearance: TIER_1_START,
        latestAppearance: TIER_2_START - 2,
        moneyDropped: 2500,
    },
    {
        fileName: "t1_medium.json",
        earliestAppearance: TIER_1_START + 3,
        latestAppearance: TIER_2_START - 2,
        moneyDropped: 3000,
    },
    { // t1 boss
        fileName: "t1_large.json",
        earliestAppearance: TIER_2_START - 1,
        latestAppearance: TIER_2_START - 1,
        moneyDropped: 5000,
    },
    
    
    { // t2
        fileName: "t2_small.json",
        earliestAppearance: TIER_2_START,
        latestAppearance: TIER_3_START - 2,
        moneyDropped: 3500,
    },
    {
        fileName: "t2_mortar.json",
        earliestAppearance: TIER_2_START,
        latestAppearance: TIER_3_START - 2,
        moneyDropped: 3500,
    },
    {
        fileName: "t2_gunner.json",
        earliestAppearance: TIER_2_START,
        latestAppearance: TIER_3_START - 2,
        moneyDropped: 3500,
    },
    { // t2 boss
        fileName: "t2_large.json",
        earliestAppearance: TIER_3_START - 1,
        latestAppearance: TIER_3_START - 1,
        moneyDropped: 6000,
    },

    
    { // t3
        fileName: "t3_small.json",
        earliestAppearance: TIER_3_START,
        latestAppearance: TIER_4_START - 2,
        moneyDropped: 4000,
    },
    { 
        fileName: "t3_small_2.json",
        earliestAppearance: TIER_3_START,
        latestAppearance: TIER_4_START - 2,
        moneyDropped: 4000,
    },
    { 
        fileName: "t3_mortar.json",
        earliestAppearance: TIER_3_START,
        latestAppearance: TIER_4_START - 2,
        moneyDropped: 5000,
    },
    {  // t3 boss
        fileName: "t3_large.json",
        earliestAppearance: TIER_4_START - 1,
        latestAppearance: TIER_4_START - 1,
        moneyDropped: 10000,
    },


    { // t4
        fileName: "t4_medium.json",
        earliestAppearance: TIER_4_START,
        latestAppearance: TIER_4_START,
        moneyDropped: 5000,
    },
    { // t4
        fileName: "t4_missile.json",
        earliestAppearance: TIER_4_START + 1,
        latestAppearance: TIER_4_START + 1,
        moneyDropped: 5000,
    },
    { // cannon brick
        fileName: "t4_cannon_brick.json",
        earliestAppearance: TIER_4_START + 2,
        latestAppearance: TIER_4_START + 2,
        moneyDropped: 5000,
    },
    
    // final boss
    {
        fileName: "final_boss.json",
        earliestAppearance: TIER_4_START + 3,
        latestAppearance: TIER_4_START + 3,
        moneyDropped: 0,

    }
];

/** A catalog tank whose appearance range includes this enemy index. */
export function pickEnemyVehicle(enemyIndex: number): PickedEnemy {
    const available = ENEMY_CATALOG.filter((record) => {
        return enemyIndex >= record.earliestAppearance && enemyIndex <= record.latestAppearance;
    });
    const record = available[Math.floor(Math.random() * available.length)];
    if (!record) {
        throw new Error(`No enemy is available at enemy index ${enemyIndex}`);
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