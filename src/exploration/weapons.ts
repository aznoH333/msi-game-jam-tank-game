import { WeaponCatalog, type WeaponDefinition, type WeaponName } from "./constants/weaponCatalog";

export interface HeldWeapon {
    definition: WeaponDefinition;
    ammo: number;
    cooldown: number;
}

/** Unlocked weapons that spend ammo. Infinite weapons and empty packs are left out. */
export function ammoPackSources(weapons: Partial<Record<WeaponName, number>>): { weapon: WeaponName; amount: number }[] {
    return WeaponCatalog.filter((weapon) => {
        return weapons[weapon.name] !== undefined && !weapon.infiniteAmmo && weapon.ammoPerPickup > 0;
    }).map((weapon) => ({ weapon: weapon.name, amount: weapon.ammoPerPickup }));
}

/** Catalog weapons present in the player's ammo record, in catalog order. */
export function loadout(weapons: Partial<Record<WeaponName, number>>): HeldWeapon[] {
    return WeaponCatalog.filter((weapon) => weapons[weapon.name] !== undefined).map((weapon) => ({
        definition: weapon,
        ammo: weapons[weapon.name] ?? 0,
        cooldown: 0,
    }));
}
