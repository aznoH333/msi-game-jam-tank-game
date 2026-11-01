const MOUSE_BUTTON_FROM_MASK: { mask: number; button: number }[] = [
    { mask: 1, button: 0 },
    { mask: 4, button: 1 },
    { mask: 2, button: 2 },
];

let mouseX = -1;
let mouseY = -1;
const heldMouseButtons = new Set<number>();
const heldKeys = new Set<string>();
let listening = false;

function trackPointer(event: PointerEvent): void {
    mouseX = event.clientX;
    mouseY = event.clientY;

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
    window.addEventListener("pointerdown", trackPointer);
    window.addEventListener("pointerup", trackPointer);
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

/** `code` is a KeyboardEvent.code, such as "KeyW" or "Space". */
export function isKeyDown(code: string): boolean {
    return heldKeys.has(code);
}
