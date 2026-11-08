export const TILE_SIZE_PX = 8; // the size of a single building grid cell in pixels

export type TileType = "WEAPON" | "UTILITY" | "BLOCK";







/**
 * Represents an unplaced game tile.
 * Holds basic general information about the tile.
 * 
 * Width and height are stored in tiles (1x1, 2x2 ect)
 * 
 */
export interface BaseTile{
    /** the name of the tile */
    tileName: string;
    
    type: TileType;
    tileSprite: string[];
    width: number;
    height: number;
    
    powerCapacity?: number;
    powerGenerationPerSecond?: number;
    /** radius of the on death explosion, measured in tiles */
    explosionRadius?: number;
    /** damage of the on death explosion */
    explosionDamage?: number;
    /** the max health of the tile */
    health: number;

    price: number;
    turret?: BaseTurret;
}

/** Pick one authored sprite from the tile's list. The same cell always gets the same sprite. */
export function tileSpriteAt(tileSprite: readonly string[] | string, x: number, y: number): string {
    const sprites = typeof tileSprite === "string" ? [tileSprite] : tileSprite;
    if (sprites.length === 0) {
        return "";
    }
    if (sprites.length === 1) {
        return sprites[0];
    }
    // Mix the coordinates so neighbors do not fall into stripes.
    let mixed = Math.imul(x | 0, 0x9E3779B1) ^ Math.imul(y | 0, 0x85EBCA77);
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7FEB352D);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846CA68B);
    mixed = (mixed ^ (mixed >>> 16)) >>> 0;
    return sprites[mixed % sprites.length];
}


/**
 * Prepresents a tile thats placed in a vehicle. 
 * Doesn't hold information about the tiles state.
 */
export interface PlacedTile {
    base: BaseTile;
    x: number; // x offset in tiles
    y: number; // y offset in tiles
    /** The used overclocks. Must always match the overclocks present in BaseTile */
    overclocks: WeaponOverclockInstance[];

}

export interface WeaponOverclockInstance {
    base: WeaponOverclockSlider;
    value: number;
}

export interface WeaponOverclockSlider {
    /** slider definition */
    name: string;
    baseValue: number;
    minValue: number;
    maxValue: number;
    stepSize: number;
    /** How many modules are needed to add 1 step to this slider */
    stepCost: number;


    /** multiplier values. Scales with points allocated */
    damage?: number;
    powerCost?: number;
    salvo?: number;
    salvoDelay?: number;
    accuracy?: number;
    reloadTime?: number;
    explosionRadius?: number;
    jamChance?: number;
    failChance?: number;
}


export type ProjectileType = "direct" | "mortar"

/**
 * Represents a turret. Holds information about the turrent doesn't hold information about its state.
 * All time related statistics are listed in seconds
 */
export interface BaseTurret {
    turretSprite: string;
    /** Where is the center of the turret sprite (rotation origin) in pixels */
    spriteCenterX: number; 

    /** Where is the center of the turret sprite (rotation origin) in pixels */
    spriteCenterY: number;

    projectileSprite: string;

    /** How much damage an individual projectile does */
    damagePerShot: number;
    /** How much power is consumed when a projecitles is fired */
    powerPerShot: number;
    /** How many times will the weapon fire per action */
    salvoCount: number;
    /** Delay between each salvo shot */
    salvoDelay: number;
    /** How much will the shot diviate from the target (in tiles) */
    accuracy: number;

    /** How long until the weapon can be fired again */
    reloadTime: number;

    /** available overclocks for this weapon */
    overClocks: WeaponOverclockSlider[];

    /** How fast does the projectile travel. Stored as tiles/second*/
    projectileSpeed: number;

    /** How big is the explosion (tiles) */
    explosionRadius: number;

    /** how should the projectile behave */
    projectileType: ProjectileType;


    /** audio */
    firingSound: string;
    impactSound: string;
}