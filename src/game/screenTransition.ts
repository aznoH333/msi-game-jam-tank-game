/** Full black-out and reveal. Half of this fades out, then the state changes, then half fades in. */
const TRANSITION_SECONDS = 0.5;

type TransitionPhase = "idle" | "out" | "in";

let phase: TransitionPhase = "idle";
let elapsed = 0;
let lastMs = 0;
let applyChange: (() => void) | null = null;

/** Fade the current picture to black, run `change` while covered, then fade the new picture in. */
export function requestTransition(change: () => void): void {
    if (phase !== "idle") {
        return;
    }
    phase = "out";
    elapsed = 0;
    lastMs = performance.now();
    applyChange = change;
}

/** Advance the fade. Call once per frame before the screen draws. */
export function updateScreenTransition(): void {
    if (phase === "idle") {
        return;
    }
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - lastMs) / 1000));
    lastMs = now;
    elapsed += dt;
    const half = TRANSITION_SECONDS / 2;
    if (phase === "out" && elapsed >= half) {
        const change = applyChange;
        applyChange = null;
        phase = "in";
        elapsed = 0;
        change?.();
        return;
    }
    if (phase === "in" && elapsed >= half) {
        phase = "idle";
        elapsed = 0;
    }
}

/** 0 is the picture, 1 is fully black. */
export function screenFadeAlpha(): number {
    const half = TRANSITION_SECONDS / 2;
    if (half <= 0) {
        return 0;
    }
    if (phase === "out") {
        return Math.min(1, elapsed / half);
    }
    if (phase === "in") {
        return 1 - Math.min(1, elapsed / half);
    }
    return 0;
}
