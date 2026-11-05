/** Width of the ability column on the combat screen. */
export const ABILITY_BAR_WIDTH = 300;

/** Tiles from the player tank center to the enemy tank center. */
export const TANK_SEPARATION = 48;

/** Scales the fitted combat view. 0.65 sits each camera about 35% further out. */
export const COMBAT_CAMERA_ZOOM = 0.65;

/** How long a landing explosion takes to expand and fade, in seconds. */
export const EXPLOSION_DURATION = 0.2;

/** Tiles a direct shot keeps flying past its aim point before a miss is deleted. */
export const DIRECT_MISS_DISTANCE = 12;

/** A vehicle loses the fight when its remaining hit points fall under this share. */
export const DEFEAT_HEALTH_RATIO = 0.2;

/** Tile radius of the blast that replaces a tank when it loses. */
export const DEFEAT_EXPLOSION_RADIUS = 5;

/** Tile radius of a repair circle. */
export const REPAIR_RADIUS = 2.5;

/** Share of a living tile's max health restored each second inside a repair circle. */
export const REPAIR_HEAL_PER_SECOND = 0.025;

/** How long a repair circle keeps healing, in seconds. */
export const REPAIR_DURATION = 5;

/** Repair heals and restores on this many simulation frames, using the time those frames covered. */
export const REPAIR_TICK_FRAMES = 10;

/** Share of max health a destroyed tile returns with on a repair tick. */
export const REPAIR_REVIVE_RATIO = 0.1;

/** Seconds before the same vehicle can repair again. */
export const REPAIR_COOLDOWN = 15;

/** A jammed shot spends this many times the gun's energy per shot and ends the salvo. */
export const JAM_ENERGY_MULTIPLIER = 1.5;

/** Tile radius of the blast a failed shot leaves on its own gun. */
export const FAIL_EXPLOSION_RADIUS = 2.5;

/** A failed shot's blast damage, as a share of that gun tile's max health. */
export const FAIL_DAMAGE_OF_MAX_HEALTH = 0.25;

/** One spark per this many hit points a tile actually loses. */
export const SPARK_DAMAGE_PER_SPARK = 5;

/** Cap so one hit cannot flood the screen. */
export const SPARK_MAX_PER_HIT = 24;

/** How long a spark stays visible, in seconds. */
export const SPARK_DURATION = 0.4;

/** A hit turns its tile white, then fades back to the normal color over this many seconds. */
export const HIT_FLASH_DURATION = 0.05;

/** Outward speed of a spark, in tiles per second. */
export const SPARK_MIN_SPEED = 8;
export const SPARK_MAX_SPEED = 16;
