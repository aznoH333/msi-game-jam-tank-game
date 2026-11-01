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
export const DEFEAT_EXPLOSION_RADIUS = 3;
