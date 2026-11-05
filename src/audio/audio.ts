const soundModules = import.meta.glob("../../assets/sounds/**/*.{ogg,wav,mp3}", {
    eager: true,
    query: "?url",
    import: "default",
});

const loadedSounds = new Map<string, AudioBuffer>();
const missingSounds = new Set<string>();

let context: AudioContext | null = null;
let unlockInstalled = false;

function audioContext(): AudioContext {
    if (!context) {
        context = new AudioContext();
    }
    return context;
}

function soundName(path: string): string {
    const marker = "assets/sounds/";
    const start = path.lastIndexOf(marker);
    const relative = start >= 0 ? path.slice(start + marker.length) : path;
    return relative.replace(/\.[^.]+$/, "");
}

/** Load every file under assets/sounds. The key drops the folder prefix and the extension. */
export function loadSounds(): Promise<void> {
    installUnlock();
    const ctx = audioContext();
    // ogg is listed last so it wins when a wav shares the same name
    const entries = Object.entries(soundModules).sort((left, right) => extensionRank(left[0]) - extensionRank(right[0]));
    const loads = entries.map(async ([path, url]) => {
        const name = soundName(path);
        try {
            const response = await fetch(String(url));
            const bytes = await response.arrayBuffer();
            loadedSounds.set(name, await ctx.decodeAudioData(bytes.slice(0)));
        } catch {
            console.warn(`Failed to load sound: ${name}`);
        }
    });
    return Promise.all(loads).then(() => undefined);
}

const ENGINE_IDLE = "building/engine_idle";
const ENGINE_MOVING = "building/engine_moving";

interface LoopVoice {
    source: AudioBufferSourceNode;
    gain: GainNode;
}

let idleLoop: LoopVoice | null = null;
let movingLoop: LoopVoice | null = null;

/** Crossfade the looping engine. 0 is stopped, 1 is full speed. */
export function setEngineBlend(speed: number): void {
    const amount = Math.min(1, Math.max(0, speed));
    const ctx = audioContext();
    if (ctx.state === "suspended") {
        void ctx.resume();
    }
    idleLoop = ensureLoop(ENGINE_IDLE, idleLoop);
    movingLoop = ensureLoop(ENGINE_MOVING, movingLoop);
    if (idleLoop) {
        idleLoop.gain.gain.value = Math.cos(amount * Math.PI / 2);
    }
    if (movingLoop) {
        movingLoop.gain.gain.value = Math.sin(amount * Math.PI / 2);
    }
}

/** Silence the engine and drop its looping voices. */
export function stopEngine(): void {
    stopLoop(idleLoop);
    stopLoop(movingLoop);
    idleLoop = null;
    movingLoop = null;
}

function ensureLoop(name: string, existing: LoopVoice | null): LoopVoice | null {
    if (existing) {
        return existing;
    }
    const buffer = loadedSounds.get(name);
    if (!buffer) {
        if (!missingSounds.has(name)) {
            missingSounds.add(name);
            console.warn(`Missing sound: ${name}`);
        }
        return null;
    }
    const ctx = audioContext();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    return { source, gain };
}

function stopLoop(voice: LoopVoice | null): void {
    if (!voice) {
        return;
    }
    voice.source.stop();
    voice.source.disconnect();
    voice.gain.disconnect();
}

/** Play a loaded sound. Overlapping calls each get their own voice. */
export function playSound(name: string): void {
    const buffer = loadedSounds.get(name);
    if (!buffer) {
        if (!missingSounds.has(name)) {
            missingSounds.add(name);
            console.warn(`Missing sound: ${name}`);
        }
        return;
    }
    const ctx = audioContext();
    if (ctx.state === "suspended") {
        void ctx.resume();
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
}

function extensionRank(path: string): number {
    if (path.endsWith(".ogg")) {
        return 2;
    }
    if (path.endsWith(".mp3")) {
        return 1;
    }
    return 0;
}

/** Browsers block audio until a click or key press. */
function installUnlock(): void {
    if (unlockInstalled) {
        return;
    }
    unlockInstalled = true;
    const unlock = () => {
        const ctx = audioContext();
        if (ctx.state === "suspended") {
            void ctx.resume();
        }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
}
