import type { BaseVehicle } from "../../building/types/vehicle";
import { vehicleFromSave, type SavedVehicle } from "../../building/vehicleSave";

export interface EnemyCatalogRecord {
    fileName: string;
    vehicleTier: number;
    isBoss: boolean;
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
        moneyDropped: 2000,
        vehicleTier: 0,
        isBoss: true,
    },

    { // t1
        fileName: "t1_small_2.json",
        moneyDropped: 2500,
        vehicleTier: 1,
        isBoss: false
    },
    {
        fileName: "t1_cannon.json",
        moneyDropped: 2500,
        vehicleTier: 1,
        isBoss: false,
    },
    {
        fileName: "t1_medium.json",
        vehicleTier: 1,
        isBoss: false,
        moneyDropped: 3000,
    },
    { // t1 boss
        fileName: "t1_large.json",
        vehicleTier: 1,
        isBoss: true,
        moneyDropped: 5000,
    },
    
    
    { // t2
        fileName: "t2_small.json",
        vehicleTier: 2,
        isBoss: false,
        moneyDropped: 3500,
    },
    {
        fileName: "t2_mortar.json",
        vehicleTier: 2,
        isBoss: false,
        moneyDropped: 3500,
    },
    {
        fileName: "t2_gunner.json",
        vehicleTier: 2,
        isBoss: false,
        moneyDropped: 3500,
    },
    { // t2 boss
        fileName: "t2_large.json",
        vehicleTier: 2,
        isBoss: true,
        moneyDropped: 6000,
    },

    
    { // t3
        fileName: "t3_small.json",
        vehicleTier: 3,
        isBoss: false,
        moneyDropped: 4000,
    },
    { 
        fileName: "t3_small_2.json",
        vehicleTier: 3,
        isBoss: false,
        moneyDropped: 4000,
    },
    { 
        fileName: "t3_mortar.json",
        vehicleTier: 3,
        isBoss: false,
        moneyDropped: 5000,
    },
    {  // t3 boss
        fileName: "t3_large.json",
        vehicleTier: 3,
        isBoss: true,
        moneyDropped: 10000,
    },


    { // t4
        fileName: "t4_medium.json",
        vehicleTier: 4,
        isBoss: false,
        moneyDropped: 5000,
    },
    { // t4
        fileName: "t4_missile.json",
        vehicleTier: 4,
        isBoss: false,
        moneyDropped: 5000,
    },
    { // cannon brick
        fileName: "t4_cannon_brick.json",
        vehicleTier: 4,
        isBoss: false,
        moneyDropped: 5000,
    },
    
    // final boss
    {
        fileName: "final_boss.json",
        vehicleTier: 4,
        isBoss: true,
        moneyDropped: 0,

    }
];

/** True when this tier has fights other than its boss. */
export function tierHasRegulars(tier: number): boolean {
    return ENEMY_CATALOG.some((record) => record.vehicleTier === tier && !record.isBoss);
}

/** A random tank from this tier. Boss picks the tier boss. An empty tier uses the last one that has that role. */
export function pickEnemyVehicle(tier: number, boss: boolean): PickedEnemy {
    const available = enemiesAt(tier, boss);
    const record = available[Math.floor(Math.random() * available.length)];
    if (!record) {
        throw new Error(`No ${boss ? "boss" : "enemy"} is available at tier ${tier}`);
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

function enemiesAt(tier: number, boss: boolean): EnemyCatalogRecord[] {
    const exact = ENEMY_CATALOG.filter((record) => record.vehicleTier === tier && record.isBoss === boss);
    if (exact.length > 0) {
        return exact;
    }
    const tiers = ENEMY_CATALOG.map((record) => record.vehicleTier);
    const fallback = Math.max(...tiers.filter((value) => value <= tier), Math.min(...tiers));
    return ENEMY_CATALOG.filter((record) => record.vehicleTier === fallback && record.isBoss === boss);
}