import { WeaponCatalog, type WeaponName } from "../exploration/constants/weaponCatalog";
import { PERSON_HEALTH_MAX, type PlayerData } from "../game/playerData";

export const MEDPACK_PRICE = 500;
export const MEDPACK_HEALTH = PERSON_HEALTH_MAX;

export type ShopOffer =
    | { kind: "medpack"; price: number; title: string }
    | { kind: "weapon"; weapon: WeaponName; price: number; title: string }
    | { kind: "ammo"; weapon: WeaponName; price: number; amount: number; title: string };

/** Purchasable guns, their ammo, and a medpack. Catalog order, medpack first. */
export function shopOffers(): ShopOffer[] {
    const offers: ShopOffer[] = [
        { kind: "medpack", price: MEDPACK_PRICE, title: "Medpack" },
    ];
    for (const weapon of WeaponCatalog) {
        if (weapon.shopPrice !== undefined) {
            offers.push({ kind: "weapon", weapon: weapon.name, price: weapon.shopPrice, title: weapon.name });
        }
        if (weapon.shopAmmoPrice !== undefined && !weapon.infiniteAmmo && weapon.ammoPerPickup > 0) {
            offers.push({
                kind: "ammo",
                weapon: weapon.name,
                price: weapon.shopAmmoPrice,
                amount: weapon.ammoPerPickup,
                title: `${weapon.name} ammo`,
            });
        }
    }
    return offers;
}

export function canBuy(player: PlayerData, offer: ShopOffer): boolean {
    if (player.money < offer.price) {
        return false;
    }
    if (offer.kind === "medpack") {
        return player.personHealth < MEDPACK_HEALTH;
    }
    if (offer.kind === "weapon") {
        return player.weapons[offer.weapon] === undefined;
    }
    const definition = WeaponCatalog.find((weapon) => weapon.name === offer.weapon);
    const ammo = player.weapons[offer.weapon];
    if (!definition || ammo === undefined || definition.infiniteAmmo) {
        return false;
    }
    return ammo < definition.ammoMax;
}

/** Spends the price and applies the offer. Returns false when the player cannot buy it. */
export function buyOffer(player: PlayerData, offer: ShopOffer): boolean {
    if (!canBuy(player, offer)) {
        return false;
    }
    player.money -= offer.price;
    if (offer.kind === "medpack") {
        player.personHealth = MEDPACK_HEALTH;
        return true;
    }
    if (offer.kind === "weapon") {
        player.weapons[offer.weapon] = 0;
        return true;
    }
    const definition = WeaponCatalog.find((weapon) => weapon.name === offer.weapon);
    const ammo = player.weapons[offer.weapon] ?? 0;
    player.weapons[offer.weapon] = Math.min(definition?.ammoMax ?? ammo, ammo + offer.amount);
    return true;
}
