import { WeaponCatalog } from "../exploration/constants/weaponCatalog";
import { canBuy, MEDPACK_HEALTH, shopOffers, type ShopOffer } from "../building/itemShop";
import { drawRect } from "../drawing/canvas";
import { drawText } from "../drawing/text";
import type { PlayerData } from "../game/playerData";
import { SIDEBAR_CONTENT_TOP, SIDEBAR_WIDTH, type Bounds } from "./buildingSidebar";

const PADDING = 16;
const ROW_HEIGHT = 64;
const ROW_GAP = 8;

export interface ItemShopRow {
    offer: ShopOffer;
    bounds: Bounds;
    enabled: boolean;
    detail: string;
}

export function layoutItemShop(player: PlayerData): ItemShopRow[] {
    let y = SIDEBAR_CONTENT_TOP;
    return shopOffers().map((offer) => {
        const bounds = {
            x: PADDING,
            y,
            width: SIDEBAR_WIDTH - PADDING * 2,
            height: ROW_HEIGHT,
        };
        y += ROW_HEIGHT + ROW_GAP;
        return {
            offer,
            bounds,
            enabled: canBuy(player, offer),
            detail: offerDetail(player, offer),
        };
    });
}

export function drawItemShop(player: PlayerData): void {
    for (const row of layoutItemShop(player)) {
        drawRect({
            x: row.bounds.x,
            y: row.bounds.y,
            width: row.bounds.width,
            height: row.bounds.height,
            color: "#262c3a",
        });
        drawText({
            text: row.offer.title,
            x: row.bounds.x + 12,
            y: row.bounds.y + 22,
            font: "16px sans-serif",
            color: row.enabled ? "#eceae4" : "#8b919c",
            align: "left",
            baseline: "middle",
        });
        drawText({
            text: row.detail,
            x: row.bounds.x + 12,
            y: row.bounds.y + 44,
            font: "13px sans-serif",
            color: "#a8a49a",
            align: "left",
            baseline: "middle",
        });
        drawText({
            text: formatPrice(row.offer.price),
            x: row.bounds.x + row.bounds.width - 12,
            y: row.bounds.y + row.bounds.height / 2,
            font: "16px sans-serif",
            color: row.enabled ? "#e6c07b" : "#6d7380",
            align: "right",
            baseline: "middle",
        });
    }
}

function offerDetail(player: PlayerData, offer: ShopOffer): string {
    if (offer.kind === "medpack") {
        return player.personHealth >= MEDPACK_HEALTH ? "Full health" : "Heal to 100";
    }
    if (offer.kind === "weapon") {
        return player.weapons[offer.weapon] === undefined ? "Unlock" : "Owned";
    }
    const definition = WeaponCatalog.find((weapon) => weapon.name === offer.weapon);
    const ammo = player.weapons[offer.weapon];
    if (ammo === undefined || !definition) {
        return "Locked";
    }
    if (ammo >= definition.ammoMax) {
        return "Full";
    }
    return `+${offer.amount}  ${ammo}/${definition.ammoMax}`;
}

function formatPrice(amount: number): string {
    return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
