import { clientToGame, GAME_HEIGHT } from "../drawing/canvas";

const MOUSE_BUTTON_FROM_MASK: { mask: number; button: number }[] = [
    { mask: 1, button: 0 },
    { mask: 4, button: 1 },
    { mask: 2, button: 2 },
];

let mouseX = -1;
let mouseY = -1;
let wheelDeltaY = 0;
let typedText = "";
const heldMouseButtons = new Set<number>();
const heldKeys = new Set<string>();
let listening = false;

function trackPointer(event: PointerEvent): void {
    const game = clientToGame(event.clientX, event.clientY);
    mouseX = game.x;
    mouseY = game.y;

    heldMouseButtons.clear();
    for (const entry of MOUSE_BUTTON_FROM_MASK) {
        if (event.buttons & entry.mask) {
            heldMouseButtons.add(entry.button);
        }
    }
}

/** Listen for mouse and keyboard input. Safe to call more than once. */
export function startInput(): void {
    if (listening) {
        return;
    }
    listening = true;

    window.addEventListener("pointermove", trackPointer);
    window.addEventListener("pointerdown", (event) => {
        if (event.button === 1) {
            event.preventDefault();
        }
        trackPointer(event);
    });
    window.addEventListener("pointerup", trackPointer);
    window.addEventListener("wheel", (event) => {
        let scale = 1;
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
            scale = 16;
        } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
            scale = GAME_HEIGHT;
        }
        wheelDeltaY += event.deltaY * scale;
        event.preventDefault();
    }, { passive: false });
    window.addEventListener("auxclick", (event) => {
        if (event.button === 1) {
            event.preventDefault();
        }
    });
    window.addEventListener("pointercancel", () => {
        heldMouseButtons.clear();
    });
    window.addEventListener("blur", () => {
        heldMouseButtons.clear();
        heldKeys.clear();
    });
    window.addEventListener("contextmenu", (event) => {
        event.preventDefault();
    });

    window.addEventListener("keydown", (event) => {
        heldKeys.add(event.code);
        if (event.key === "Backspace") {
            typedText += "\b";
            event.preventDefault();
            return;
        }
        if (event.key === "Enter") {
            typedText += "\n";
            return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
            return;
        }
        typedText += event.key;
    });
    window.addEventListener("keyup", (event) => {
        heldKeys.delete(event.code);
    });
}

export function getMousePosition(): { x: number; y: number } {
    return { x: mouseX, y: mouseY };
}

/** `button` is 0 for left, 1 for middle, and 2 for right. */
export function isMouseButtonDown(button: number): boolean {
    return heldMouseButtons.has(button);
}

/** Vertical wheel movement since the last call. Positive is scrolling down. */
export function consumeWheelDelta(): number {
    const delta = wheelDeltaY;
    wheelDeltaY = 0;
    return delta;
}

/** Characters typed since the last call. Includes backspace and enter. */
export function consumeTypedText(): string {
    const text = typedText;
    typedText = "";
    return text;
}

/** `code` is a KeyboardEvent.code, such as "KeyW" or "Space". */
export function isKeyDown(code: string): boolean {
    return heldKeys.has(code);
}
