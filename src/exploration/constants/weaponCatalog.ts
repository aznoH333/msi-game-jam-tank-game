
export type WeaponName = "fists" | "pistol" | "shotgun" | "machine gun" | "plasma gun";

export interface WeaponDefinition {
    name: WeaponName,
    shotsPerSecond: number,
    damageMin: number,
    damageMax: number,
    ammoMax: number,
    /** range of the weapon in tiles (won't deal damage after this) */
    range: number,
    infiniteAmmo: boolean,
    weaponHotkey: number,
    /** How much does the gun cost in the shop tab, when undefined -> not purchasable */
    shopPrice?: number,
    /** How much does the ammo cost in shos, when undefined -> nor purchasable */
    shopAmmoPrice?: number,
    /** how much ammo does the player get when picking up an ammo pack/buying it from the shop. Don't spawn ammo packs for infinite ammo weapons */
    ammoPerPickup: number,
}

export const WeaponCatalog: WeaponDefinition[] = [
    {
        name: "fists",
        shotsPerSecond: 3,
        damageMin: 10,
        damageMax: 20,
        ammoMax: 0,
        range: 0.5,
        infiniteAmmo: true,
        weaponHotkey: 1,
        shopPrice: undefined,
        shopAmmoPrice: undefined,
        ammoPerPickup: 0,
    },
    {
        name: "pistol",
        shotsPerSecond: 3,
        damageMin: 10,
        damageMax: 20,
        ammoMax: 100,
        range: 100,
        infiniteAmmo: false,
        weaponHotkey: 2,
        shopPrice: undefined,
        shopAmmoPrice: 10,
        ammoPerPickup: 10,
    },
    {
        name: "shotgun",
        shotsPerSecond: 2,
        damageMin: 30,
        damageMax: 50,
        ammoMax: 50,
        range: 4,
        infiniteAmmo: false,
        weaponHotkey: 3,
        shopPrice: 10_000,
        shopAmmoPrice: 100,
        ammoPerPickup: 4,
    },
    {
        name: "machine gun",
        shotsPerSecond: 10,
        damageMin: 10,
        damageMax: 20,
        ammoMax: 200,
        range: 100,
        infiniteAmmo: false,
        weaponHotkey: 3,
        shopPrice: 20_000,
        shopAmmoPrice: 100,
        ammoPerPickup: 30
    },
    {
        name: "plasma gun",
        shotsPerSecond: 10,
        damageMin: 30,
        damageMax: 40,
        ammoMax: 200,
        range: 100,
        infiniteAmmo: false,
        weaponHotkey: 3,
        shopPrice: 40_000,
        shopAmmoPrice: undefined,
        ammoPerPickup: 50
    },
]