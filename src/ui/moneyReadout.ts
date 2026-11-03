import { drawRect, strokeRect } from "../drawing/canvas";
import { drawText } from "../drawing/text";

/** Shared by the shop sidebar and the combat ability bar. */
export function drawMoneyReadout(x: number, y: number, width: number, money: number): void {
    drawCounter(x, y, width, 36, 16, 12, "Money", formatMoney(money), "#e6c07b");
}

/** A shorter money counter, with the amount in blue. */
export function drawModuleReadout(x: number, y: number, width: number, modules: number): void {
    drawCounter(x, y, width, 26, 13, 8, "Modules", String(Math.max(0, Math.round(modules))), "#8ecbff");
}

function drawCounter(
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    pad: number,
    label: string,
    value: string,
    valueColor: string,
): void {
    const font = `${fontSize}px sans-serif`;
    drawRect({
        x,
        y,
        width,
        height,
        color: "#141820",
    });
    strokeRect({
        x: x + 0.5,
        y: y + 0.5,
        width: width - 1,
        height: height - 1,
        color: "#3a4254",
    });
    const textY = y + height / 2;
    drawText({
        text: label,
        x: x + pad,
        y: textY,
        font,
        color: "#d7d5cf",
        align: "left",
        baseline: "middle",
    });
    drawText({
        text: value,
        x: x + width - pad,
        y: textY,
        font,
        color: valueColor,
        align: "right",
        baseline: "middle",
    });
}

function formatMoney(amount: number): string {
    const rounded = Math.round(amount);
    const sign = rounded < 0 ? "-" : "";
    const digits = String(Math.abs(rounded));
    return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
