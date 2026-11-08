import { GAME_HEIGHT, GAME_WIDTH, getCanvasContext, mirrorGameCanvas, type DrawClip } from "./canvas";
import { getSpriteImage } from "./sprites";

/** Y is up. Yaw 0 looks down +Z, and positive yaw turns left. */
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface Camera3D {
    position: Vec3;
    yaw: number;
    pitch: number;
    /** Vertical field of view, in radians. */
    fov: number;
}

export interface Triangle3D {
    a: Vec3;
    b: Vec3;
    c: Vec3;
    color: string;
    /** Sprite mapped with `uvA`/`uvB`/`uvC`. Untextured triangles ignore the UVs. */
    sprite?: string;
    uvA?: readonly [number, number];
    uvB?: readonly [number, number];
    uvC?: readonly [number, number];
    /** Repeat the texture along V. U stays clamped, so a 0–1 span keeps its edge pixels. */
    wrapV?: boolean;
}

/** Sprite quad that always faces the camera. `position` is the center. */
export interface Billboard3D {
    position: Vec3;
    width: number;
    height: number;
    sprite: string;
    /** 1 is solid. Lower values blend the sprite out. */
    alpha?: number;
}

/** Screen-space sprite drawn with the sky, so the world covers it. `x` and `y` are the center. */
export interface SkySprite {
    sprite: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ScreenRect {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Distance in front of the camera. */
    depth: number;
}

export interface DistanceFog {
    color: string;
    /** Horizontal distance where the fade begins. */
    start: number;
    /** Horizontal distance where the color is fully the fog color. */
    end: number;
}

export interface Scene3D {
    viewport: DrawClip;
    camera: Camera3D;
    triangles: Triangle3D[];
    background: string;
    /** Screen-space color behind the world, from the top of the viewport to the bottom. */
    sky?: { top: string; bottom: string };
    billboards?: Billboard3D[];
    /** Top half of the viewport is sky, bottom half is ground, both behind the triangles. */
    horizon?: {
        sky: string;
        ground: string;
        /** Camera height off each plane, so a flat fill can use the same distance fog as the walls. */
        eyeAboveFloor?: number;
        eyeBelowCeiling?: number;
    };
    /** Painted after the sky fill and before the world. */
    skySprite?: SkySprite;
    fog?: DistanceFog;
}

const NEAR_PLANE = 0.08;
const FAR_PLANE = 500;
const queuedScenes: Scene3D[] = [];

const GL_OPTIONS: WebGLContextAttributes = {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
};

let glCanvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let programsReady = false;

let colorProgram: WebGLProgram | null = null;
let colorViewProj: WebGLUniformLocation | null = null;
let colorFog = emptyFogUniforms();
let groundProgram: WebGLProgram | null = null;
let groundColor: WebGLUniformLocation | null = null;
let groundFog = emptyFogUniforms();
let groundEye: WebGLUniformLocation | null = null;
let groundHalfTan: WebGLUniformLocation | null = null;
let groundAspect: WebGLUniformLocation | null = null;
let groundView: WebGLUniformLocation | null = null;
let skyProgram: WebGLProgram | null = null;
let skyTop: WebGLUniformLocation | null = null;
let skyBottom: WebGLUniformLocation | null = null;
let skySpriteProgram: WebGLProgram | null = null;
let skySpriteSampler: WebGLUniformLocation | null = null;
let spriteProgram: WebGLProgram | null = null;
let spriteViewProj: WebGLUniformLocation | null = null;
let spriteSampler: WebGLUniformLocation | null = null;
let spriteRepeat: WebGLUniformLocation | null = null;
let spriteAlpha: WebGLUniformLocation | null = null;
let spriteFog = emptyFogUniforms();

interface FogUniforms {
    color: WebGLUniformLocation | null;
    start: WebGLUniformLocation | null;
    end: WebGLUniformLocation | null;
    enabled: WebGLUniformLocation | null;
    camera: WebGLUniformLocation | null;
}

function emptyFogUniforms(): FogUniforms {
    return { color: null, start: null, end: null, enabled: null, camera: null };
}

let triBuffer: WebGLBuffer | null = null;
let groundBuffer: WebGLBuffer | null = null;
let skySpriteBuffer: WebGLBuffer | null = null;
let spriteBuffer: WebGLBuffer | null = null;
let texBuffer: WebGLBuffer | null = null;
let triData = new Float32Array(4096);
let texData = new Float32Array(4096);
let uploadedTriangles: Triangle3D[] | null = null;
const spriteData = new Float32Array(30);
const skySpriteData = new Float32Array(24);
const viewProj = new Float32Array(16);
const textures = new Map<string, WebGLTexture>();

const FOG_SNIPPET = `
uniform vec3 u_fogColor;
uniform vec2 u_camera;
uniform float u_fogStart;
uniform float u_fogEnd;
uniform float u_fogEnabled;
vec3 applyFog(vec3 color, float dist) {
    if (u_fogEnabled < 0.5) {
        return color;
    }
    float fog = clamp((dist - u_fogStart) / (u_fogEnd - u_fogStart), 0.0, 1.0);
    return mix(color, u_fogColor, fog);
}
`;

const COLOR_VS = `
attribute vec3 a_position;
attribute vec3 a_color;
uniform mat4 u_viewProj;
varying vec3 v_color;
varying vec3 v_world;
void main() {
    v_world = a_position;
    v_color = a_color;
    gl_Position = u_viewProj * vec4(a_position, 1.0);
}
`;

const COLOR_FS = `
precision mediump float;
varying vec3 v_color;
varying vec3 v_world;
${FOG_SNIPPET}
void main() {
    float dist = distance(v_world.xz, u_camera);
    gl_FragColor = vec4(applyFog(v_color, dist), 1.0);
}
`;

const GROUND_VS = `
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 1.0, 1.0);
}
`;

const GROUND_FS = `
precision mediump float;
uniform vec3 u_color;
uniform float u_eye;
uniform float u_halfTan;
uniform float u_aspect;
uniform vec4 u_view;
${FOG_SNIPPET}
void main() {
    float dist = u_fogEnd;
    float ndcY = ((gl_FragCoord.y - u_view.y) / u_view.w) * 2.0 - 1.0;
    float denom = ndcY * u_halfTan;
    if (abs(denom) >= 0.0001) {
        float ahead = abs(u_eye / denom);
        float ndcX = ((gl_FragCoord.x - u_view.x) / u_view.z) * 2.0 - 1.0;
        float side = ndcX * ahead * u_halfTan * u_aspect;
        dist = sqrt(ahead * ahead + side * side);
    }
    gl_FragColor = vec4(applyFog(u_color, dist), 1.0);
}
`;

const SKY_VS = `
attribute vec2 a_position;
varying float v_y;
void main() {
    v_y = a_position.y * 0.5 + 0.5;
    gl_Position = vec4(a_position, 1.0, 1.0);
}
`;

const SKY_FS = `
precision mediump float;
uniform vec3 u_top;
uniform vec3 u_bottom;
varying float v_y;
void main() {
    gl_FragColor = vec4(mix(u_bottom, u_top, v_y), 1.0);
}
`;

const SKY_SPRITE_VS = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
    v_uv = a_uv;
    gl_Position = vec4(a_position, 1.0, 1.0);
}
`;

const SKY_SPRITE_FS = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
void main() {
    vec4 color = texture2D(u_texture, v_uv);
    if (color.a <= 0.5) discard;
    gl_FragColor = vec4(color.rgb, 1.0);
}
`;

const SPRITE_VS = `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat4 u_viewProj;
varying vec2 v_uv;
varying vec3 v_world;
void main() {
    v_world = a_position;
    v_uv = a_uv;
    gl_Position = u_viewProj * vec4(a_position, 1.0);
}
`;

const SPRITE_FS = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_repeatV;
uniform float u_alpha;
varying vec2 v_uv;
varying vec3 v_world;
${FOG_SNIPPET}
void main() {
    float v = u_repeatV > 0.5 ? fract(v_uv.y) : v_uv.y;
    vec4 color = texture2D(u_texture, vec2(v_uv.x, v));
    if (color.a <= 0.5) discard;
    float dist = distance(v_world.xz, u_camera);
    gl_FragColor = vec4(applyFog(color.rgb, dist), u_alpha);
}
`;

/** Ground is the bottom half of clip space, sky the top half. */
const HORIZON_VERTS = new Float32Array([
    -1, -1, 1, -1, 1, 0, -1, -1, 1, 0, -1, 0,
    -1, 0, 1, 0, 1, 1, -1, 0, 1, 1, -1, 1,
]);

/** Queue a 3D scene. `render3D` paints it before the 2D layers. */
export function drawScene3D(scene: Scene3D): void {
    queuedScenes.push(scene);
}

export function render3D(): void {
    const scenes = queuedScenes.splice(0);
    if (scenes.length === 0) {
        return;
    }
    const gpu = ensureGl();
    if (!gpu || !glCanvas) {
        return;
    }
    mirrorGameCanvas(glCanvas);
    gpu.disable(gpu.CULL_FACE);
    gpu.disable(gpu.BLEND);
    gpu.depthFunc(gpu.LEQUAL);
    gpu.enable(gpu.SCISSOR_TEST);
    const context = getCanvasContext();
    for (const scene of scenes) {
        paintScene(gpu, context, scene);
    }
    gpu.disable(gpu.SCISSOR_TEST);
}

export interface PlaneTexture {
    sprite: string;
    /** UV at the (-x, -z) corner and the (+x, +z) corner. */
    u0: number;
    v0: number;
    u1: number;
    v1: number;
}

/** One copy of a facade. Height is measured down from the top of the box. */
export interface FaceTexture {
    sprite: string;
    width: number;
    height: number;
}

/** Horizontal quad on the XZ plane, centered on `center`. */
export function planeTriangles(
    center: Vec3,
    width: number,
    depth: number,
    color: string,
    texture?: PlaneTexture,
): Triangle3D[] {
    const hx = width / 2;
    const hz = depth / 2;
    const y = center.y;
    const a = { x: center.x - hx, y, z: center.z - hz };
    const b = { x: center.x + hx, y, z: center.z - hz };
    const c = { x: center.x + hx, y, z: center.z + hz };
    const d = { x: center.x - hx, y, z: center.z + hz };
    const uvA: readonly [number, number] = [texture?.u0 ?? 0, texture?.v0 ?? 0];
    const uvB: readonly [number, number] = [texture?.u1 ?? 1, texture?.v0 ?? 0];
    const uvC: readonly [number, number] = [texture?.u1 ?? 1, texture?.v1 ?? 1];
    const uvD: readonly [number, number] = [texture?.u0 ?? 0, texture?.v1 ?? 1];
    const sprite = texture?.sprite;
    return [
        { a, b, c, color, sprite, uvA, uvB, uvC },
        { a, b: c, c: d, color, sprite, uvA, uvB: uvC, uvC: uvD },
    ];
}

/** Axis-aligned box. `size` is the full width, height, and depth. Faces are shaded from `color`. */
export function boxTriangles(center: Vec3, size: Vec3, color: string, facade?: FaceTexture): Triangle3D[] {
    const hx = size.x / 2;
    const hy = size.y / 2;
    const hz = size.z / 2;
    const x0 = center.x - hx;
    const x1 = center.x + hx;
    const y0 = center.y - hy;
    const y1 = center.y + hy;
    const z0 = center.z - hz;
    const z1 = center.z + hz;
    const point = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
    const along = (value: number, origin: number): number => facade ? (value - origin) / facade.width : 0;
    const down = (y: number): number => facade ? (y1 - y) / facade.height : 0;
    const wall = (y: number, horizontal: number): readonly [number, number] => [horizontal, down(y)];
    const blank: readonly [number, number] = [0, 0];
    const faces: { shade: number; quad: [Vec3, Vec3, Vec3, Vec3]; uv: readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]] }[] = [
        {
            shade: 1.2,
            quad: [point(x0, y1, z1), point(x1, y1, z1), point(x1, y1, z0), point(x0, y1, z0)],
            uv: [blank, blank, blank, blank],
        },
        {
            shade: 0.78,
            quad: [point(x0, y0, z1), point(x1, y0, z1), point(x1, y1, z1), point(x0, y1, z1)],
            uv: [wall(y0, along(x0, x0)), wall(y0, along(x1, x0)), wall(y1, along(x1, x0)), wall(y1, along(x0, x0))],
        },
        {
            shade: 0.5,
            quad: [point(x1, y0, z0), point(x0, y0, z0), point(x0, y1, z0), point(x1, y1, z0)],
            uv: [wall(y0, along(x1, x0)), wall(y0, along(x0, x0)), wall(y1, along(x0, x0)), wall(y1, along(x1, x0))],
        },
        {
            shade: 0.95,
            quad: [point(x1, y0, z1), point(x1, y0, z0), point(x1, y1, z0), point(x1, y1, z1)],
            uv: [wall(y0, along(z1, z0)), wall(y0, along(z0, z0)), wall(y1, along(z0, z0)), wall(y1, along(z1, z0))],
        },
        {
            shade: 0.62,
            quad: [point(x0, y0, z0), point(x0, y0, z1), point(x0, y1, z1), point(x0, y1, z0)],
            uv: [wall(y0, along(z0, z0)), wall(y0, along(z1, z0)), wall(y1, along(z1, z0)), wall(y1, along(z0, z0))],
        },
    ];
    const triangles: Triangle3D[] = [];
    for (const [index, face] of faces.entries()) {
        const [a, b, c, d] = face.quad;
        const [uvA, uvB, uvC, uvD] = face.uv;
        const textured = facade !== undefined && index > 0;
        const faceColor = scaleHex(color, face.shade);
        const sprite = textured ? facade.sprite : undefined;
        triangles.push(
            { a, b, c, color: faceColor, sprite, uvA, uvB, uvC, wrapV: textured },
            { a, b: c, c: d, color: faceColor, sprite, uvA, uvB: uvC, uvC: uvD, wrapV: textured },
        );
    }
    return triangles;
}

function paintScene(gpu: WebGLRenderingContext, context: CanvasRenderingContext2D, scene: Scene3D): void {
    const view = scene.viewport;
    const bitmapWidth = glCanvas?.width ?? 0;
    const bitmapHeight = glCanvas?.height ?? 0;
    if (view.width <= 0 || view.height <= 0 || bitmapWidth <= 0 || bitmapHeight <= 0) {
        return;
    }
    const vx = Math.round(view.x * bitmapWidth / GAME_WIDTH);
    const vw = Math.max(1, Math.round(view.width * bitmapWidth / GAME_WIDTH));
    const vh = Math.max(1, Math.round(view.height * bitmapHeight / GAME_HEIGHT));
    const vy = bitmapHeight - Math.round((view.y + view.height) * bitmapHeight / GAME_HEIGHT);
    gpu.viewport(vx, vy, vw, vh);
    gpu.scissor(vx, vy, vw, vh);
    gpu.enable(gpu.DEPTH_TEST);
    gpu.depthMask(true);

    const clear = parseColor(scene.fog?.color ?? scene.horizon?.sky ?? scene.background);
    gpu.clearColor(clear[0] / 255, clear[1] / 255, clear[2] / 255, 1);
    gpu.clear(gpu.COLOR_BUFFER_BIT | gpu.DEPTH_BUFFER_BIT);
    if (scene.sky) {
        paintSky(gpu, scene);
    }
    if (scene.horizon) {
        paintHorizon(gpu, scene, vx, vy, vw, vh);
    }
    paintSkySprite(gpu, scene);
    gpu.enable(gpu.DEPTH_TEST);
    gpu.depthMask(true);

    setViewProjection(scene.camera, vw / vh);
    paintTriangles(gpu, scene);
    paintBillboards(gpu, scene);
    // The 2D canvas sits on top. Leave this rectangle transparent so the WebGL frame shows through.
    context.clearRect(view.x, view.y, view.width, view.height);
}

function paintSky(gpu: WebGLRenderingContext, scene: Scene3D): void {
    const sky = scene.sky;
    if (!sky || !groundBuffer) {
        return;
    }
    gpu.disable(gpu.DEPTH_TEST);
    gpu.depthMask(false);
    gpu.useProgram(skyProgram);
    const [topRed, topGreen, topBlue] = parseColor(sky.top);
    const [bottomRed, bottomGreen, bottomBlue] = parseColor(sky.bottom);
    gpu.uniform3f(skyTop, topRed / 255, topGreen / 255, topBlue / 255);
    gpu.uniform3f(skyBottom, bottomRed / 255, bottomGreen / 255, bottomBlue / 255);
    gpu.bindBuffer(gpu.ARRAY_BUFFER, groundBuffer);
    gpu.enableVertexAttribArray(0);
    gpu.disableVertexAttribArray(1);
    gpu.vertexAttribPointer(0, 2, gpu.FLOAT, false, 0, 0);
    gpu.drawArrays(gpu.TRIANGLES, 0, HORIZON_VERTS.length / 2);
}

/** A sky decoration. Depth stays off, so the road and buildings paint over it. */
function paintSkySprite(gpu: WebGLRenderingContext, scene: Scene3D): void {
    const sprite = scene.skySprite;
    if (!sprite || !skySpriteProgram || !skySpriteBuffer) {
        return;
    }
    const texture = spriteTexture(gpu, sprite.sprite);
    const view = scene.viewport;
    if (!texture || view.width <= 0 || view.height <= 0) {
        return;
    }
    const centerX = ((sprite.x - view.x) / view.width) * 2 - 1;
    const centerY = 1 - ((sprite.y - view.y) / view.height) * 2;
    const halfWidth = sprite.width / view.width;
    const halfHeight = sprite.height / view.height;
    const corners: readonly [number, number, number, number][] = [
        [centerX - halfWidth, centerY - halfHeight, 0, 1],
        [centerX + halfWidth, centerY - halfHeight, 1, 1],
        [centerX + halfWidth, centerY + halfHeight, 1, 0],
        [centerX - halfWidth, centerY - halfHeight, 0, 1],
        [centerX + halfWidth, centerY + halfHeight, 1, 0],
        [centerX - halfWidth, centerY + halfHeight, 0, 0],
    ];
    let offset = 0;
    for (const corner of corners) {
        skySpriteData[offset++] = corner[0];
        skySpriteData[offset++] = corner[1];
        skySpriteData[offset++] = corner[2];
        skySpriteData[offset++] = corner[3];
    }
    gpu.disable(gpu.DEPTH_TEST);
    gpu.depthMask(false);
    gpu.useProgram(skySpriteProgram);
    gpu.uniform1i(skySpriteSampler, 0);
    gpu.bindBuffer(gpu.ARRAY_BUFFER, skySpriteBuffer);
    gpu.bufferData(gpu.ARRAY_BUFFER, skySpriteData, gpu.DYNAMIC_DRAW);
    gpu.enableVertexAttribArray(0);
    gpu.enableVertexAttribArray(1);
    gpu.vertexAttribPointer(0, 2, gpu.FLOAT, false, 16, 0);
    gpu.vertexAttribPointer(1, 2, gpu.FLOAT, false, 16, 8);
    gpu.activeTexture(gpu.TEXTURE0);
    gpu.bindTexture(gpu.TEXTURE_2D, texture);
    gpu.drawArrays(gpu.TRIANGLES, 0, 6);
}

function paintHorizon(gpu: WebGLRenderingContext, scene: Scene3D, vx: number, vy: number, vw: number, vh: number): void {
    const horizon = scene.horizon;
    if (!horizon) {
        return;
    }
    gpu.disable(gpu.DEPTH_TEST);
    gpu.depthMask(false);
    gpu.useProgram(groundProgram);
    bindFog(gpu, groundFog, scene.fog, scene.camera);
    gpu.uniform1f(groundHalfTan, Math.tan(scene.camera.fov / 2));
    gpu.uniform1f(groundAspect, vw / vh);
    gpu.uniform4f(groundView, vx, vy, vw, vh);
    gpu.bindBuffer(gpu.ARRAY_BUFFER, groundBuffer);
    gpu.enableVertexAttribArray(0);
    gpu.disableVertexAttribArray(1);
    gpu.vertexAttribPointer(0, 2, gpu.FLOAT, false, 0, 0);
    const [groundRed, groundGreen, groundBlue] = parseColor(horizon.ground);
    gpu.uniform3f(groundColor, groundRed / 255, groundGreen / 255, groundBlue / 255);
    gpu.uniform1f(groundEye, horizon.eyeAboveFloor ?? 1);
    gpu.drawArrays(gpu.TRIANGLES, 0, 6);
    const [skyRed, skyGreen, skyBlue] = parseColor(horizon.sky);
    gpu.uniform3f(groundColor, skyRed / 255, skyGreen / 255, skyBlue / 255);
    gpu.uniform1f(groundEye, horizon.eyeBelowCeiling ?? 1);
    gpu.drawArrays(gpu.TRIANGLES, 6, 6);
}

function paintTriangles(gpu: WebGLRenderingContext, scene: Scene3D): void {
    const triangles = scene.triangles;
    let textured = false;
    for (const triangle of triangles) {
        if (triangle.sprite) {
            textured = true;
            break;
        }
    }
    const solid = textured ? triangles.filter((triangle) => !triangle.sprite) : triangles;
    paintSolidTriangles(gpu, scene, solid);
    if (textured) {
        paintTexturedTriangles(gpu, scene, triangles);
    }
}

function paintSolidTriangles(gpu: WebGLRenderingContext, scene: Scene3D, triangles: Triangle3D[]): void {
    if (triangles.length === 0 || !triBuffer) {
        return;
    }
    const floats = triangles.length * 18;
    if (triData.length < floats) {
        let size = triData.length;
        while (size < floats) {
            size *= 2;
        }
        triData = new Float32Array(size);
    }
    gpu.useProgram(colorProgram);
    gpu.uniformMatrix4fv(colorViewProj, false, viewProj);
    bindFog(gpu, colorFog, scene.fog, scene.camera);
    gpu.bindBuffer(gpu.ARRAY_BUFFER, triBuffer);
    if (triangles !== uploadedTriangles) {
        let offset = 0;
        for (const triangle of triangles) {
            const [red, green, blue] = parseColor(triangle.color);
            const r = red / 255;
            const g = green / 255;
            const b = blue / 255;
            offset = writeVertex(offset, triangle.a, r, g, b);
            offset = writeVertex(offset, triangle.b, r, g, b);
            offset = writeVertex(offset, triangle.c, r, g, b);
        }
        gpu.bufferData(gpu.ARRAY_BUFFER, triData.subarray(0, offset), gpu.DYNAMIC_DRAW);
        uploadedTriangles = triangles;
    }
    gpu.enableVertexAttribArray(0);
    gpu.enableVertexAttribArray(1);
    gpu.vertexAttribPointer(0, 3, gpu.FLOAT, false, 24, 0);
    gpu.vertexAttribPointer(1, 3, gpu.FLOAT, false, 24, 12);
    gpu.drawArrays(gpu.TRIANGLES, 0, triangles.length * 3);
}

function paintTexturedTriangles(gpu: WebGLRenderingContext, scene: Scene3D, triangles: Triangle3D[]): void {
    if (!texBuffer) {
        return;
    }
    const groups = new Map<string, { sprite: string; wrapV: boolean; triangles: Triangle3D[] }>();
    for (const triangle of triangles) {
        if (!triangle.sprite) {
            continue;
        }
        const wrapV = triangle.wrapV === true;
        const key = `${triangle.sprite}:${wrapV ? 1 : 0}`;
        let group = groups.get(key);
        if (!group) {
            group = { sprite: triangle.sprite, wrapV, triangles: [] };
            groups.set(key, group);
        }
        group.triangles.push(triangle);
    }
    if (groups.size === 0) {
        return;
    }
    gpu.useProgram(spriteProgram);
    gpu.uniformMatrix4fv(spriteViewProj, false, viewProj);
    bindFog(gpu, spriteFog, scene.fog, scene.camera);
    gpu.uniform1i(spriteSampler, 0);
    gpu.uniform1f(spriteAlpha, 1);
    gpu.bindBuffer(gpu.ARRAY_BUFFER, texBuffer);
    gpu.enableVertexAttribArray(0);
    gpu.enableVertexAttribArray(1);
    gpu.vertexAttribPointer(0, 3, gpu.FLOAT, false, 20, 0);
    gpu.vertexAttribPointer(1, 2, gpu.FLOAT, false, 20, 12);
    gpu.activeTexture(gpu.TEXTURE0);
    for (const group of groups.values()) {
        const texture = spriteTexture(gpu, group.sprite);
        if (!texture) {
            continue;
        }
        const floats = group.triangles.length * 15;
        if (texData.length < floats) {
            let size = texData.length;
            while (size < floats) {
                size *= 2;
            }
            texData = new Float32Array(size);
        }
        let offset = 0;
        for (const triangle of group.triangles) {
            offset = writeTexVertex(offset, triangle.a, triangle.uvA);
            offset = writeTexVertex(offset, triangle.b, triangle.uvB);
            offset = writeTexVertex(offset, triangle.c, triangle.uvC);
        }
        gpu.bufferData(gpu.ARRAY_BUFFER, texData.subarray(0, offset), gpu.DYNAMIC_DRAW);
        gpu.uniform1f(spriteRepeat, group.wrapV ? 1 : 0);
        gpu.bindTexture(gpu.TEXTURE_2D, texture);
        gpu.drawArrays(gpu.TRIANGLES, 0, group.triangles.length * 3);
    }
}

function writeTexVertex(offset: number, point: Vec3, uv: readonly [number, number] | undefined): number {
    texData[offset] = point.x;
    texData[offset + 1] = point.y;
    texData[offset + 2] = point.z;
    texData[offset + 3] = uv?.[0] ?? 0;
    texData[offset + 4] = uv?.[1] ?? 0;
    return offset + 5;
}

function writeVertex(offset: number, point: Vec3, red: number, green: number, blue: number): number {
    triData[offset] = point.x;
    triData[offset + 1] = point.y;
    triData[offset + 2] = point.z;
    triData[offset + 3] = red;
    triData[offset + 4] = green;
    triData[offset + 5] = blue;
    return offset + 6;
}

function paintBillboards(gpu: WebGLRenderingContext, scene: Scene3D): void {
    const billboards = scene.billboards ?? [];
    if (billboards.length === 0 || !spriteBuffer) {
        return;
    }
    const basis = cameraBasis(scene.camera);
    gpu.useProgram(spriteProgram);
    gpu.uniformMatrix4fv(spriteViewProj, false, viewProj);
    bindFog(gpu, spriteFog, scene.fog, scene.camera);
    gpu.uniform1i(spriteSampler, 0);
    gpu.uniform1f(spriteRepeat, 0);
    gpu.uniform1f(spriteAlpha, 1);
    gpu.bindBuffer(gpu.ARRAY_BUFFER, spriteBuffer);
    gpu.enableVertexAttribArray(0);
    gpu.enableVertexAttribArray(1);
    gpu.vertexAttribPointer(0, 3, gpu.FLOAT, false, 20, 0);
    gpu.vertexAttribPointer(1, 2, gpu.FLOAT, false, 20, 12);
    for (const billboard of billboards) {
        const texture = spriteTexture(gpu, billboard.sprite);
        if (!texture) {
            continue;
        }
        const alpha = billboard.alpha ?? 1;
        const fading = alpha < 0.999;
        if (fading) {
            gpu.enable(gpu.BLEND);
            gpu.blendFunc(gpu.SRC_ALPHA, gpu.ONE_MINUS_SRC_ALPHA);
        }
        gpu.uniform1f(spriteAlpha, alpha);
        writeBillboard(billboard, basis);
        gpu.bufferData(gpu.ARRAY_BUFFER, spriteData, gpu.DYNAMIC_DRAW);
        gpu.activeTexture(gpu.TEXTURE0);
        gpu.bindTexture(gpu.TEXTURE_2D, texture);
        gpu.drawArrays(gpu.TRIANGLES, 0, 6);
        if (fading) {
            gpu.disable(gpu.BLEND);
            gpu.uniform1f(spriteAlpha, 1);
        }
    }
}

/** Camera-facing quad in viewport pixels. Null when the center is behind the camera. */
export function projectBillboard(
    position: Vec3,
    width: number,
    height: number,
    camera: Camera3D,
    viewport: { x: number; y: number; width: number; height: number },
): ScreenRect | null {
    const basis = cameraBasis(camera);
    const dx = position.x - camera.position.x;
    const dy = position.y - camera.position.y;
    const dz = position.z - camera.position.z;
    const vx = basis.right.x * dx + basis.right.y * dy + basis.right.z * dz;
    const vy = basis.up.x * dx + basis.up.y * dy + basis.up.z * dz;
    const vz = basis.forward.x * dx + basis.forward.y * dy + basis.forward.z * dz;
    if (vz <= NEAR_PLANE) {
        return null;
    }
    const focal = 1 / Math.tan(camera.fov / 2);
    const aspect = viewport.width / viewport.height;
    const ndcX = (focal / aspect) * vx / vz;
    const ndcY = focal * vy / vz;
    const pixelsPerUnit = focal * (viewport.height / 2) / vz;
    const screenWidth = width * pixelsPerUnit;
    const screenHeight = height * pixelsPerUnit;
    const centerX = viewport.x + (ndcX + 1) * 0.5 * viewport.width;
    const centerY = viewport.y + (1 - ndcY) * 0.5 * viewport.height;
    return {
        x: centerX - screenWidth / 2,
        y: centerY - screenHeight / 2,
        width: screenWidth,
        height: screenHeight,
        depth: vz,
    };
}

function writeBillboard(billboard: Billboard3D, basis: { right: Vec3; up: Vec3 }): void {
    const hx = billboard.width / 2;
    const hy = billboard.height / 2;
    const origin = billboard.position;
    const right = basis.right;
    const up = basis.up;
    const corners: [number, number, number, number][] = [
        [-1, -1, 0, 1],
        [1, -1, 1, 1],
        [1, 1, 1, 0],
        [-1, -1, 0, 1],
        [1, 1, 1, 0],
        [-1, 1, 0, 0],
    ];
    let offset = 0;
    for (const [xSign, ySign, u, v] of corners) {
        spriteData[offset++] = origin.x + right.x * hx * xSign + up.x * hy * ySign;
        spriteData[offset++] = origin.y + right.y * hx * xSign + up.y * hy * ySign;
        spriteData[offset++] = origin.z + right.z * hx * xSign + up.z * hy * ySign;
        spriteData[offset++] = u;
        spriteData[offset++] = v;
    }
}

function spriteTexture(gpu: WebGLRenderingContext, sprite: string): WebGLTexture | null {
    const cached = textures.get(sprite);
    if (cached) {
        return cached;
    }
    const image = getSpriteImage(sprite);
    if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) {
        return null;
    }
    const texture = gpu.createTexture();
    if (!texture) {
        return null;
    }
    gpu.bindTexture(gpu.TEXTURE_2D, texture);
    gpu.pixelStorei(gpu.UNPACK_FLIP_Y_WEBGL, false);
    gpu.pixelStorei(gpu.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gpu.texImage2D(gpu.TEXTURE_2D, 0, gpu.RGBA, gpu.RGBA, gpu.UNSIGNED_BYTE, image);
    gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_WRAP_S, gpu.CLAMP_TO_EDGE);
    gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_WRAP_T, gpu.CLAMP_TO_EDGE);
    gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_MIN_FILTER, gpu.NEAREST);
    gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_MAG_FILTER, gpu.NEAREST);
    textures.set(sprite, texture);
    return texture;
}

function ensureGl(): WebGLRenderingContext | null {
    if (!glCanvas) {
        glCanvas = document.createElement("canvas");
        glCanvas.id = "world";
        glCanvas.style.pointerEvents = "none";
        const game = document.getElementById("game");
        game?.parentElement?.insertBefore(glCanvas, game);
        glCanvas.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            programsReady = false;
        });
        glCanvas.addEventListener("webglcontextrestored", () => {
            programsReady = false;
        });
    }
    if (!gl) {
        gl = glCanvas.getContext("webgl", GL_OPTIONS);
        if (!gl) {
            throw new Error("WebGL is unavailable");
        }
    }
    if (gl.isContextLost()) {
        return null;
    }
    if (!programsReady) {
        initPrograms(gl);
        programsReady = true;
    }
    return gl;
}

function bindFog(gpu: WebGLRenderingContext, uniforms: FogUniforms, fog: DistanceFog | undefined, camera: Camera3D): void {
    gpu.uniform2f(uniforms.camera, camera.position.x, camera.position.z);
    if (!fog || fog.end <= fog.start) {
        gpu.uniform1f(uniforms.enabled, 0);
        gpu.uniform1f(uniforms.start, 0);
        gpu.uniform1f(uniforms.end, 1);
        gpu.uniform3f(uniforms.color, 0, 0, 0);
        return;
    }
    const [red, green, blue] = parseColor(fog.color);
    gpu.uniform1f(uniforms.enabled, 1);
    gpu.uniform1f(uniforms.start, fog.start);
    gpu.uniform1f(uniforms.end, fog.end);
    gpu.uniform3f(uniforms.color, red / 255, green / 255, blue / 255);
}

function fogLocations(gpu: WebGLRenderingContext, program: WebGLProgram): FogUniforms {
    return {
        color: gpu.getUniformLocation(program, "u_fogColor"),
        start: gpu.getUniformLocation(program, "u_fogStart"),
        end: gpu.getUniformLocation(program, "u_fogEnd"),
        enabled: gpu.getUniformLocation(program, "u_fogEnabled"),
        camera: gpu.getUniformLocation(program, "u_camera"),
    };
}

function initPrograms(gpu: WebGLRenderingContext): void {
    textures.clear();
    uploadedTriangles = null;
    colorProgram = linkProgram(gpu, COLOR_VS, COLOR_FS, ["a_position", "a_color"]);
    colorViewProj = gpu.getUniformLocation(colorProgram, "u_viewProj");
    colorFog = fogLocations(gpu, colorProgram);
    groundProgram = linkProgram(gpu, GROUND_VS, GROUND_FS, ["a_position"]);
    groundColor = gpu.getUniformLocation(groundProgram, "u_color");
    groundFog = fogLocations(gpu, groundProgram);
    groundEye = gpu.getUniformLocation(groundProgram, "u_eye");
    groundHalfTan = gpu.getUniformLocation(groundProgram, "u_halfTan");
    groundAspect = gpu.getUniformLocation(groundProgram, "u_aspect");
    groundView = gpu.getUniformLocation(groundProgram, "u_view");
    skyProgram = linkProgram(gpu, SKY_VS, SKY_FS, ["a_position"]);
    skyTop = gpu.getUniformLocation(skyProgram, "u_top");
    skyBottom = gpu.getUniformLocation(skyProgram, "u_bottom");
    skySpriteProgram = linkProgram(gpu, SKY_SPRITE_VS, SKY_SPRITE_FS, ["a_position", "a_uv"]);
    skySpriteSampler = gpu.getUniformLocation(skySpriteProgram, "u_texture");
    spriteProgram = linkProgram(gpu, SPRITE_VS, SPRITE_FS, ["a_position", "a_uv"]);
    spriteViewProj = gpu.getUniformLocation(spriteProgram, "u_viewProj");
    spriteSampler = gpu.getUniformLocation(spriteProgram, "u_texture");
    spriteRepeat = gpu.getUniformLocation(spriteProgram, "u_repeatV");
    spriteAlpha = gpu.getUniformLocation(spriteProgram, "u_alpha");
    spriteFog = fogLocations(gpu, spriteProgram);

    triBuffer = gpu.createBuffer();
    groundBuffer = gpu.createBuffer();
    skySpriteBuffer = gpu.createBuffer();
    spriteBuffer = gpu.createBuffer();
    texBuffer = gpu.createBuffer();
    gpu.bindBuffer(gpu.ARRAY_BUFFER, groundBuffer);
    gpu.bufferData(gpu.ARRAY_BUFFER, HORIZON_VERTS, gpu.STATIC_DRAW);
}

function linkProgram(gpu: WebGLRenderingContext, vertexSource: string, fragmentSource: string, attribs: string[]): WebGLProgram {
    const program = gpu.createProgram();
    if (!program) {
        throw new Error("Could not create a WebGL program");
    }
    const vertex = compileShader(gpu, gpu.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gpu, gpu.FRAGMENT_SHADER, fragmentSource);
    gpu.attachShader(program, vertex);
    gpu.attachShader(program, fragment);
    attribs.forEach((name, index) => gpu.bindAttribLocation(program, index, name));
    gpu.linkProgram(program);
    gpu.deleteShader(vertex);
    gpu.deleteShader(fragment);
    if (!gpu.getProgramParameter(program, gpu.LINK_STATUS)) {
        const log = gpu.getProgramInfoLog(program) ?? "";
        gpu.deleteProgram(program);
        throw new Error(log || "Could not link a WebGL program");
    }
    return program;
}

function compileShader(gpu: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gpu.createShader(type);
    if (!shader) {
        throw new Error("Could not create a WebGL shader");
    }
    gpu.shaderSource(shader, source);
    gpu.compileShader(shader);
    if (!gpu.getShaderParameter(shader, gpu.COMPILE_STATUS)) {
        const log = gpu.getShaderInfoLog(shader) ?? "";
        gpu.deleteShader(shader);
        throw new Error(log || "Could not compile a WebGL shader");
    }
    return shader;
}

/** Camera looks down +Z, so clip-space w is the forward depth. */
function setViewProjection(camera: Camera3D, aspect: number): void {
    const basis = cameraBasis(camera);
    const origin = camera.position;
    const right = basis.right;
    const up = basis.up;
    const forward = basis.forward;
    const tx = -(right.x * origin.x + right.y * origin.y + right.z * origin.z);
    const ty = -(up.x * origin.x + up.y * origin.y + up.z * origin.z);
    const tz = -(forward.x * origin.x + forward.y * origin.y + forward.z * origin.z);
    const focal = 1 / Math.tan(camera.fov / 2);
    const sx = focal / aspect;
    const sy = focal;
    const depth = FAR_PLANE - NEAR_PLANE;
    const a = (FAR_PLANE + NEAR_PLANE) / depth;
    const b = (-2 * NEAR_PLANE * FAR_PLANE) / depth;
    viewProj[0] = sx * right.x;
    viewProj[1] = sy * up.x;
    viewProj[2] = a * forward.x;
    viewProj[3] = forward.x;
    viewProj[4] = sx * right.y;
    viewProj[5] = sy * up.y;
    viewProj[6] = a * forward.y;
    viewProj[7] = forward.y;
    viewProj[8] = sx * right.z;
    viewProj[9] = sy * up.z;
    viewProj[10] = a * forward.z;
    viewProj[11] = forward.z;
    viewProj[12] = sx * tx;
    viewProj[13] = sy * ty;
    viewProj[14] = a * tz + b;
    viewProj[15] = tz;
}

function cameraBasis(camera: Camera3D): { right: Vec3; up: Vec3; forward: Vec3 } {
    const yawForward = { x: -Math.sin(camera.yaw), y: 0, z: Math.cos(camera.yaw) };
    const yawRight = { x: Math.cos(camera.yaw), y: 0, z: Math.sin(camera.yaw) };
    const cos = Math.cos(camera.pitch);
    const sin = Math.sin(camera.pitch);
    return {
        right: yawRight,
        forward: {
            x: yawForward.x * cos,
            y: sin,
            z: yawForward.z * cos,
        },
        up: {
            x: -yawForward.x * sin,
            y: cos,
            z: -yawForward.z * sin,
        },
    };
}

function parseColor(color: string): [number, number, number] {
    if (color.startsWith("#")) {
        const rgb = Number.parseInt(color.slice(1), 16);
        return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255];
    }
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) {
        return [255, 255, 255];
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function scaleHex(hex: string, factor: number): string {
    const rgb = Number.parseInt(hex.slice(1), 16);
    const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * factor)));
    const red = channel((rgb >> 16) & 255);
    const green = channel((rgb >> 8) & 255);
    const blue = channel(rgb & 255);
    return `rgb(${red}, ${green}, ${blue})`;
}
