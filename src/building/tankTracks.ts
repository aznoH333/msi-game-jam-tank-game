export const TANK_TRACK_SPRITES = [
    "tiles/tiles_1x1_0009",
    "tiles/tiles_1x1_0010",
    "tiles/tiles_1x1_0011",
];

export const TANK_TRACK_SPRITE = TANK_TRACK_SPRITES[0];

/** One full tread cycle for each tile of forward travel. Still when distance does not change. */
export function tankTrackSprite(distanceTiles: number): string {
    const index = Math.floor(distanceTiles * TANK_TRACK_SPRITES.length);
    const wrapped = ((index % TANK_TRACK_SPRITES.length) + TANK_TRACK_SPRITES.length) % TANK_TRACK_SPRITES.length;
    return TANK_TRACK_SPRITES[wrapped];
}

export interface TrackColumn {
    /** Top-left of the track column, in tile coordinates. */
    x: number;
    y: number;
    /** How many 1x1 track sprites to stack downward. */
    length: number;
}

interface TrackTile {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Left and right tread columns for a vehicle.
 * Each column is one tile longer than the tiles in that column, shifted half a tile down
 * and half a tile toward the middle of the vehicle.
 */
export function tankTrackColumns(tiles: readonly TrackTile[]): TrackColumn[] {
    if (tiles.length === 0) {
        return [];
    }

    let left = tiles[0].x;
    let right = tiles[0].x + tiles[0].width - 1;
    for (const tile of tiles) {
        left = Math.min(left, tile.x);
        right = Math.max(right, tile.x + tile.width - 1);
    }

    let trackOffsetX = 0.5;

    if (right <= left + 2) {
        trackOffsetX = -0.25;
    }

    const columns: { column: number; towardCenter: number }[] = [
        { column: left, towardCenter: trackOffsetX },
        { column: right, towardCenter: -trackOffsetX },
    ];
    const tracks: TrackColumn[] = [];
    for (const side of columns) {
        let top = Number.POSITIVE_INFINITY;
        let bottom = Number.NEGATIVE_INFINITY;
        for (const tile of tiles) {
            if (side.column < tile.x || side.column >= tile.x + tile.width) {
                continue;
            }
            top = Math.min(top, tile.y);
            bottom = Math.max(bottom, tile.y + tile.height);
        }
        tracks.push({
            x: side.column + side.towardCenter,
            y: top - 0.5,
            length: bottom - top + 1,
        });
    }
    return tracks;
}
