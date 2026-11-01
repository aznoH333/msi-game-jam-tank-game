import { getCanvasContext, type DrawClip } from "./canvas";
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
}

/** Sprite quad that always faces the camera. `position` is the center. */
export interface Billboard3D {
    position: Vec3;
    width: number;
    height: number;
    sprite: string;
}

export interface Scene3D {
    viewport: DrawClip;
    camera: Camera3D;
    triangles: Triangle3D[];
    background: string;
    billboards?: Billboard3D[];
}

interface CameraPoint {
    x: number;
    y: number;
    z: number;
}

const NEAR_PLANE = 0.08;
const queuedScenes: Scene3D[] = [];

let depthCanvas: HTMLCanvasElement | null = null;
let depthContext: CanvasRenderingContext2D | null = null;
let depthPixels: ImageData | null = null;
let depthValues: Float32Array | null = null;
const billboardPixels = new Map<string, ImageData>();

/** Queue a 3D scene. `render3D` paints it before the 2D layers. */
export function drawScene3D(scene: Scene3D): void {
    queuedScenes.push(scene);
}

export function render3D(): void {
    const scenes = queuedScenes.splice(0);
    if (scenes.length === 0) {
        return;
    }
    const context = getCanvasContext();
    for (const scene of scenes) {
        paintScene(context, scene);
    }
}

/** Horizontal quad on the XZ plane, centered on `center`. */
export function planeTriangles(center: Vec3, width: number, depth: number, color: string): Triangle3D[] {
    const hx = width / 2;
    const hz = depth / 2;
    const y = center.y;
    const a = { x: center.x - hx, y, z: center.z - hz };
    const b = { x: center.x + hx, y, z: center.z - hz };
    const c = { x: center.x + hx, y, z: center.z + hz };
    const d = { x: center.x - hx, y, z: center.z + hz };
    return [
        { a, b, c, color },
        { a, b: c, c: d, color },
    ];
}

/** Axis-aligned box. `size` is the full width, height, and depth. Faces are shaded from `color`. */
export function boxTriangles(center: Vec3, size: Vec3, color: string): Triangle3D[] {
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
    const faces: { shade: number; quad: [Vec3, Vec3, Vec3, Vec3] }[] = [
        { shade: 1.2, quad: [point(x0, y1, z1), point(x1, y1, z1), point(x1, y1, z0), point(x0, y1, z0)] },
        { shade: 0.78, quad: [point(x0, y0, z1), point(x1, y0, z1), point(x1, y1, z1), point(x0, y1, z1)] },
        { shade: 0.5, quad: [point(x1, y0, z0), point(x0, y0, z0), point(x0, y1, z0), point(x1, y1, z0)] },
        { shade: 0.95, quad: [point(x1, y0, z1), point(x1, y0, z0), point(x1, y1, z0), point(x1, y1, z1)] },
        { shade: 0.62, quad: [point(x0, y0, z0), point(x0, y0, z1), point(x0, y1, z1), point(x0, y1, z0)] },
    ];
    const triangles: Triangle3D[] = [];
    for (const face of faces) {
        const [a, b, c, d] = face.quad;
        const faceColor = scaleHex(color, face.shade);
        triangles.push({ a, b, c, color: faceColor }, { a, b: c, c: d, color: faceColor });
    }
    return triangles;
}

interface ScreenVertex {
    x: number;
    y: number;
    invZ: number;
}

function paintScene(context: CanvasRenderingContext2D, scene: Scene3D): void {
    const view = scene.viewport;
    const width = Math.ceil(view.width);
    const height = Math.ceil(view.height);
    if (width <= 0 || height <= 0) {
        return;
    }

    const buffer = ensureDepthBuffer(width, height);
    const pixels = buffer.pixels.data;
    const depth = buffer.depth;
    const background = parseColor(scene.background);
    for (let index = 0, pixel = 0; index < depth.length; index++, pixel += 4) {
        pixels[pixel] = background[0];
        pixels[pixel + 1] = background[1];
        pixels[pixel + 2] = background[2];
        pixels[pixel + 3] = 255;
        depth[index] = 0;
    }

    const basis = cameraBasis(scene.camera);
    for (const triangle of scene.triangles) {
        const cameraPoints = [triangle.a, triangle.b, triangle.c].map((vertex) => toCamera(vertex, scene.camera.position, basis));
        const clipped = clipNear(cameraPoints, NEAR_PLANE);
        if (clipped.length < 3) {
            continue;
        }
        const projected = clipped.map((point) => projectLocal(point, scene.camera.fov, width, height));
        const [red, green, blue] = parseColor(triangle.color);
        for (let index = 1; index < projected.length - 1; index++) {
            rasterizeTriangle(pixels, depth, width, height, projected[0], projected[index], projected[index + 1], red, green, blue);
        }
    }

    for (const billboard of scene.billboards ?? []) {
        paintBillboard(pixels, depth, width, height, scene.camera, basis, billboard);
    }

    buffer.context.putImageData(buffer.pixels, 0, 0);
    const smoothing = context.imageSmoothingEnabled;
    context.imageSmoothingEnabled = true;
    context.drawImage(buffer.canvas, view.x, view.y, view.width, view.height);
    context.imageSmoothingEnabled = smoothing;
}

function ensureDepthBuffer(width: number, height: number): {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    pixels: ImageData;
    depth: Float32Array;
} {
    if (depthCanvas && depthContext && depthPixels && depthValues && depthCanvas.width === width && depthCanvas.height === height) {
        return { canvas: depthCanvas, context: depthContext, pixels: depthPixels, depth: depthValues };
    }
    depthCanvas = document.createElement("canvas");
    depthCanvas.width = width;
    depthCanvas.height = height;
    const context = depthCanvas.getContext("2d");
    if (!context) {
        throw new Error("2D canvas is unavailable");
    }
    depthContext = context;
    depthPixels = context.createImageData(width, height);
    depthValues = new Float32Array(width * height);
    return { canvas: depthCanvas, context, pixels: depthPixels, depth: depthValues };
}

/** Fill only covered pixels, keeping the nearer surface. A larger inverse-z is closer. */
function rasterizeTriangle(
    pixels: Uint8ClampedArray,
    depth: Float32Array,
    width: number,
    height: number,
    a: ScreenVertex,
    b: ScreenVertex,
    c: ScreenVertex,
    red: number,
    green: number,
    blue: number,
): void {
    const verts = [a, b, c].sort((first, second) => first.y - second.y);
    const top = verts[0];
    const middle = verts[1];
    const bottom = verts[2];
    if (bottom.y - top.y < 1e-4) {
        return;
    }

    const yStart = Math.max(0, Math.ceil(top.y - 0.5));
    const yEnd = Math.min(height - 1, Math.floor(bottom.y - 0.5));
    for (let y = yStart; y <= yEnd; y++) {
        const py = y + 0.5;
        const longT = (py - top.y) / (bottom.y - top.y);
        let xLong = top.x + (bottom.x - top.x) * longT;
        let zLong = top.invZ + (bottom.invZ - top.invZ) * longT;
        let xShort = xLong;
        let zShort = zLong;
        if (py < middle.y && middle.y - top.y > 1e-4) {
            const shortT = (py - top.y) / (middle.y - top.y);
            xShort = top.x + (middle.x - top.x) * shortT;
            zShort = top.invZ + (middle.invZ - top.invZ) * shortT;
        } else if (bottom.y - middle.y > 1e-4) {
            const shortT = (py - middle.y) / (bottom.y - middle.y);
            xShort = middle.x + (bottom.x - middle.x) * shortT;
            zShort = middle.invZ + (bottom.invZ - middle.invZ) * shortT;
        }

        if (xLong > xShort) {
            const swapX = xLong;
            xLong = xShort;
            xShort = swapX;
            const swapZ = zLong;
            zLong = zShort;
            zShort = swapZ;
        }

        const xStart = Math.max(0, Math.ceil(xLong - 0.5));
        const xEnd = Math.min(width - 1, Math.floor(xShort - 0.5));
        if (xStart > xEnd) {
            continue;
        }
        const span = xShort - xLong;
        const zStep = span === 0 ? 0 : (zShort - zLong) / span;
        let invZ = zLong + zStep * (xStart + 0.5 - xLong);
        let index = y * width + xStart;
        for (let x = xStart; x <= xEnd; x++, index++) {
            if (invZ > depth[index]) {
                depth[index] = invZ;
                const pixel = index * 4;
                pixels[pixel] = red;
                pixels[pixel + 1] = green;
                pixels[pixel + 2] = blue;
                pixels[pixel + 3] = 255;
            }
            invZ += zStep;
        }
    }
}

interface TexturedVertex {
    x: number;
    y: number;
    invZ: number;
    uOverZ: number;
    vOverZ: number;
}

/** Draw the sprite on a quad perpendicular to the camera. */
function paintBillboard(
    pixels: Uint8ClampedArray,
    depth: Float32Array,
    width: number,
    height: number,
    camera: Camera3D,
    basis: { right: Vec3; up: Vec3; forward: Vec3 },
    billboard: Billboard3D,
): void {
    const image = billboardImage(billboard.sprite);
    if (!image) {
        return;
    }
    const hx = billboard.width / 2;
    const hy = billboard.height / 2;
    const right = basis.right;
    const up = basis.up;
    const origin = billboard.position;
    const corner = (xSign: number, ySign: number, u: number, v: number): TexturedVertex | null => {
        const world = {
            x: origin.x + right.x * hx * xSign + up.x * hy * ySign,
            y: origin.y + right.y * hx * xSign + up.y * hy * ySign,
            z: origin.z + right.z * hx * xSign + up.z * hy * ySign,
        };
        const cameraPoint = toCamera(world, camera.position, basis);
        if (cameraPoint.z < NEAR_PLANE) {
            return null;
        }
        const projected = projectLocal(cameraPoint, camera.fov, width, height);
        return {
            x: projected.x,
            y: projected.y,
            invZ: projected.invZ,
            uOverZ: u * projected.invZ,
            vOverZ: v * projected.invZ,
        };
    };
    const bottomLeft = corner(-1, -1, 0, 1);
    const bottomRight = corner(1, -1, 1, 1);
    const topRight = corner(1, 1, 1, 0);
    const topLeft = corner(-1, 1, 0, 0);
    if (!bottomLeft || !bottomRight || !topRight || !topLeft) {
        return;
    }
    rasterizeTexturedTriangle(pixels, depth, width, height, bottomLeft, bottomRight, topRight, image);
    rasterizeTexturedTriangle(pixels, depth, width, height, bottomLeft, topRight, topLeft, image);
}

function billboardImage(sprite: string): ImageData | null {
    const cached = billboardPixels.get(sprite);
    if (cached) {
        return cached;
    }
    const image = getSpriteImage(sprite);
    if (!image || image.width === 0 || image.height === 0) {
        return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) {
        return null;
    }
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height);
    billboardPixels.set(sprite, data);
    return data;
}

function rasterizeTexturedTriangle(
    pixels: Uint8ClampedArray,
    depth: Float32Array,
    width: number,
    height: number,
    a: TexturedVertex,
    b: TexturedVertex,
    c: TexturedVertex,
    image: ImageData,
): void {
    const verts = [a, b, c].sort((first, second) => first.y - second.y);
    const top = verts[0];
    const middle = verts[1];
    const bottom = verts[2];
    if (bottom.y - top.y < 1e-4) {
        return;
    }

    const yStart = Math.max(0, Math.ceil(top.y - 0.5));
    const yEnd = Math.min(height - 1, Math.floor(bottom.y - 0.5));
    for (let y = yStart; y <= yEnd; y++) {
        const py = y + 0.5;
        const longT = (py - top.y) / (bottom.y - top.y);
        let xLong = top.x + (bottom.x - top.x) * longT;
        let zLong = top.invZ + (bottom.invZ - top.invZ) * longT;
        let uLong = top.uOverZ + (bottom.uOverZ - top.uOverZ) * longT;
        let vLong = top.vOverZ + (bottom.vOverZ - top.vOverZ) * longT;
        let xShort = xLong;
        let zShort = zLong;
        let uShort = uLong;
        let vShort = vLong;
        if (py < middle.y && middle.y - top.y > 1e-4) {
            const shortT = (py - top.y) / (middle.y - top.y);
            xShort = top.x + (middle.x - top.x) * shortT;
            zShort = top.invZ + (middle.invZ - top.invZ) * shortT;
            uShort = top.uOverZ + (middle.uOverZ - top.uOverZ) * shortT;
            vShort = top.vOverZ + (middle.vOverZ - top.vOverZ) * shortT;
        } else if (bottom.y - middle.y > 1e-4) {
            const shortT = (py - middle.y) / (bottom.y - middle.y);
            xShort = middle.x + (bottom.x - middle.x) * shortT;
            zShort = middle.invZ + (bottom.invZ - middle.invZ) * shortT;
            uShort = middle.uOverZ + (bottom.uOverZ - middle.uOverZ) * shortT;
            vShort = middle.vOverZ + (bottom.vOverZ - middle.vOverZ) * shortT;
        }

        if (xLong > xShort) {
            const swapX = xLong;
            xLong = xShort;
            xShort = swapX;
            const swapZ = zLong;
            zLong = zShort;
            zShort = swapZ;
            const swapU = uLong;
            uLong = uShort;
            uShort = swapU;
            const swapV = vLong;
            vLong = vShort;
            vShort = swapV;
        }

        const xStart = Math.max(0, Math.ceil(xLong - 0.5));
        const xEnd = Math.min(width - 1, Math.floor(xShort - 0.5));
        if (xStart > xEnd) {
            continue;
        }
        const span = xShort - xLong;
        const zStep = span === 0 ? 0 : (zShort - zLong) / span;
        const uStep = span === 0 ? 0 : (uShort - uLong) / span;
        const vStep = span === 0 ? 0 : (vShort - vLong) / span;
        const startOffset = xStart + 0.5 - xLong;
        let invZ = zLong + zStep * startOffset;
        let uOverZ = uLong + uStep * startOffset;
        let vOverZ = vLong + vStep * startOffset;
        let index = y * width + xStart;
        for (let x = xStart; x <= xEnd; x++, index++) {
            if (invZ > depth[index]) {
                const u = uOverZ / invZ;
                const v = vOverZ / invZ;
                if (u >= 0 && v >= 0 && u <= 1 && v <= 1) {
                    const sx = Math.min(image.width - 1, Math.floor(u * image.width));
                    const sy = Math.min(image.height - 1, Math.floor(v * image.height));
                    const source = (sy * image.width + sx) * 4;
                    if (image.data[source + 3] > 128) {
                        depth[index] = invZ;
                        const pixel = index * 4;
                        pixels[pixel] = image.data[source];
                        pixels[pixel + 1] = image.data[source + 1];
                        pixels[pixel + 2] = image.data[source + 2];
                        pixels[pixel + 3] = 255;
                    }
                }
            }
            invZ += zStep;
            uOverZ += uStep;
            vOverZ += vStep;
        }
    }
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

function toCamera(point: Vec3, origin: Vec3, basis: { right: Vec3; up: Vec3; forward: Vec3 }): CameraPoint {
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    const z = point.z - origin.z;
    return {
        x: x * basis.right.x + y * basis.right.y + z * basis.right.z,
        y: x * basis.up.x + y * basis.up.y + z * basis.up.z,
        z: x * basis.forward.x + y * basis.forward.y + z * basis.forward.z,
    };
}

function clipNear(points: CameraPoint[], near: number): CameraPoint[] {
    const output: CameraPoint[] = [];
    for (let index = 0; index < points.length; index++) {
        const current = points[index];
        const previous = points[(index + points.length - 1) % points.length];
        const currentIn = current.z >= near;
        const previousIn = previous.z >= near;
        if (currentIn !== previousIn && current.z !== previous.z) {
            const t = (near - previous.z) / (current.z - previous.z);
            output.push({
                x: previous.x + (current.x - previous.x) * t,
                y: previous.y + (current.y - previous.y) * t,
                z: near,
            });
        }
        if (currentIn) {
            output.push(current);
        }
    }
    return output;
}

function projectLocal(point: CameraPoint, fov: number, width: number, height: number): ScreenVertex {
    const focal = 1 / Math.tan(fov / 2);
    const aspect = width / height;
    const ndcX = (point.x / point.z) * focal / aspect;
    const ndcY = (point.y / point.z) * focal;
    return {
        x: (ndcX + 1) * 0.5 * width,
        y: (1 - ndcY) * 0.5 * height,
        invZ: 1 / point.z,
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
