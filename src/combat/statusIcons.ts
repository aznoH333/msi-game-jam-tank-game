/** One fade from visible to gone. A fault plays two of these. */
export const ICON_FLASH_PERIOD = 1;

/** A jam or fail icon plays two flashes, then stops. */
export const FAULT_ICON_DURATION = ICON_FLASH_PERIOD * 2;

/** 1 at the start of each flash, fading to 0 across the period. Stops after `duration`. */
export function iconFlashAlpha(age: number, duration = Number.POSITIVE_INFINITY): number {
    if (age < 0 || age >= duration) {
        return 0;
    }
    const into = age % ICON_FLASH_PERIOD;
    return 1 - into / ICON_FLASH_PERIOD;
}
