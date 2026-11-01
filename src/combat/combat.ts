import { TILE_SIZE_PX } from "../building/types/tiles";
import { getOverclockedTurretStats, getTotalPowerCapacity } from "../building/vehicleUtils";
import type { BaseVehicle } from "../building/types/vehicle";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, setDrawClip } from "../drawing/canvas";
import { drawSprite, getSpriteSize } from "../drawing/sprites";
import { getGameState } from "../game/gameState";
import { getMousePosition, isMouseButtonDown } from "../input/input";
import { ABILITY_BAR_WIDTH, drawAbilityBar, layoutAbilityButtons } from "./abilityBar";
import { EXPLOSION_DURATION, TANK_SEPARATION } from "./constants";
import {
    aimRotation,
    drawCombatVehicle,
    layoutCombatVehicle,
    localToWorld,
    makeCombatCamera,
    screenToWorld,
    tileToWorld,
    worldToScreen,
    type CombatCamera,
} from "./combatView";
import type { TileInstance } from "./types/tileInstance";
import type { VehicleInstance } from "./types/vehicleInstance";

const PROJECTILE_SPRITE = "combat/debug_projectile";
const EXPLOSION_SPRITE = "combat/debug_explosion";

type CombatControl = "PLAYER" | "ENEMY";

interface GunRuntime {
    shotsLeft: number;
    timeUntilShot: number;
    cooldown: number;
    hasTarget: boolean;
    /** Aim point in world tiles, before accuracy scatter. */
    targetX: number;
    targetY: number;
}

interface Combatant {
    instance: VehicleInstance;
    control: CombatControl;
    selectedAbility: number;
    guns: GunRuntime[];
}

interface Projectile {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    age: number;
    duration: number;
    explosionRadius: number;
    damage: number;
}

interface Explosion {
    x: number;
    y: number;
    radius: number;
    age: number;
}

interface CombatInput {
    chosenAbility: number | null;
    target: { x: number; y: number } | null;
}

let encounterEvent = -1;
let player: Combatant | null = null;
let enemy: Combatant | null = null;
let leftWasDown = false;
let lastUpdateMs = 0;
let projectiles: Projectile[] = [];
let explosions: Explosion[] = [];

function gunsOf(instance: VehicleInstance): TileInstance[] {
    return instance.tiles.filter((part) => part.tile.base.turret !== undefined);
}

function createCombatant(vehicle: BaseVehicle, control: CombatControl): Combatant {
    const base = structuredClone(vehicle);
    const instance: VehicleInstance = {
        base,
        tiles: base.tiles.map((tile) => ({
            tile,
            health: tile.base.health,
        })),
        power: getTotalPowerCapacity(base),
    };
    return {
        instance,
        control,
        selectedAbility: -1,
        guns: gunsOf(instance).map(() => ({
            shotsLeft: 0,
            timeUntilShot: 0,
            cooldown: 0,
            hasTarget: false,
            targetX: 0,
            targetY: 0,
        })),
    };
}

/** Draw a projectile if this camera can currently see it. */
function drawWorldProjectile(
    camera: CombatCamera,
    worldX: number,
    worldY: number,
    worldDx: number,
    worldDy: number,
    scale: number,
): void {
    const screen = worldToScreen(camera, worldX, worldY);
    const view = camera.view;
    const margin = 32;
    if (
        screen.x < view.x - margin || screen.y < view.y - margin
        || screen.x > view.x + view.width + margin
        || screen.y > view.y + view.height + margin
    ) {
        return;
    }
    setDrawClip({ x: view.x, y: view.y, width: view.width, height: view.height });
    drawSprite({
        sprite: PROJECTILE_SPRITE,
        x: screen.x,
        y: screen.y,
        scaleX: scale,
        scaleY: scale,
        rotationRad: aimRotation(worldDx, worldDy, false),
        zIndex: 5,
    });
}

/** Draw a landing burst if this camera can see it. Scale and opacity follow the same progress. */
function drawExplosion(camera: CombatCamera, explosion: Explosion, growth: number): void {
    const sprite = getSpriteSize(EXPLOSION_SPRITE);
    if (!sprite || sprite.width <= 0) {
        return;
    }
    const screen = worldToScreen(camera, explosion.x, explosion.y);
    const view = camera.view;
    const fullScale = (explosion.radius * 2 * camera.layout.cell) / sprite.width;
    const scale = fullScale * growth;
    const margin = explosion.radius * camera.layout.cell + 8;
    if (
        screen.x < view.x - margin || screen.y < view.y - margin
        || screen.x > view.x + view.width + margin
        || screen.y > view.y + view.height + margin
    ) {
        return;
    }
    setDrawClip({ x: view.x, y: view.y, width: view.width, height: view.height });
    drawSprite({
        sprite: EXPLOSION_SPRITE,
        x: screen.x,
        y: screen.y,
        scaleX: scale,
        scaleY: scale,
        alpha: 1 - growth,
        zIndex: 6,
    });
}

/** Player and enemy share this update. Only the supplied input can start a shot. */
function updateCombatant(
    combatant: Combatant,
    dt: number,
    input: CombatInput | null,
    ownCamera: CombatCamera | null,
): void {
    if (input?.chosenAbility !== null && input?.chosenAbility !== undefined) {
        combatant.selectedAbility = input.chosenAbility;
    }

    const guns = gunsOf(combatant.instance);
    const selected = combatant.guns[combatant.selectedAbility];
    const selectedGun = guns[combatant.selectedAbility];
    if (
        input?.target
        && selected
        && selectedGun
        && selectedGun.health > 0
        && selected.shotsLeft <= 0
        && selected.cooldown <= 0
    ) {
        const gun = selectedGun;
        const turret = gun.tile.base.turret;
        if (turret) {
            const stats = getOverclockedTurretStats(turret, gun.tile.overclocks);
            const count = Math.max(0, Math.round(stats.salvoCount));
            if (count > 0) {
                selected.shotsLeft = count;
                selected.timeUntilShot = 0;
                selected.hasTarget = true;
                selected.targetX = input.target.x;
                selected.targetY = input.target.y;
            }
        }
    }

    // firing cycle: one shot, wait the salvo delay, then reload after the last shot
    for (let index = 0; index < combatant.guns.length; index++) {
        const runtime = combatant.guns[index];
        const gun = guns[index];
        const turret = gun?.tile.base.turret;
        if (!gun || !turret || !ownCamera || gun.health <= 0) {
            runtime.shotsLeft = 0;
            continue;
        }
        const stats = getOverclockedTurretStats(turret, gun.tile.overclocks);
        if (runtime.shotsLeft > 0) {
            runtime.timeUntilShot -= dt;
            while (runtime.shotsLeft > 0 && runtime.timeUntilShot <= 0) {
                const origin = tileToWorld(
                    ownCamera,
                    gun.tile.x,
                    gun.tile.y,
                    gun.tile.base.width,
                    gun.tile.base.height,
                );
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.sqrt(Math.random()) * stats.accuracy;
                const toX = runtime.targetX + Math.cos(angle) * radius;
                const toY = runtime.targetY + Math.sin(angle) * radius;
                const speed = Math.max(0.001, stats.projectileSpeed);
                projectiles.push({
                    fromX: origin.x,
                    fromY: origin.y,
                    toX,
                    toY,
                    age: 0,
                    duration: Math.hypot(toX - origin.x, toY - origin.y) / speed,
                    explosionRadius: Math.max(0, stats.explosionRadius),
                    damage: Math.max(0, stats.damagePerShot),
                });
                runtime.shotsLeft -= 1;
                if (runtime.shotsLeft > 0 && stats.salvoDelay > 0) {
                    runtime.timeUntilShot += stats.salvoDelay;
                } else if (runtime.shotsLeft > 0) {
                    runtime.timeUntilShot = 0;
                } else {
                    runtime.cooldown = stats.reloadTime;
                }
            }
        } else if (runtime.cooldown > 0) {
            runtime.cooldown = Math.max(0, runtime.cooldown - dt);
        }
    }
}

/** Damage every living tile in range, and let destroyed explosive tiles burst too. */
function detonate(
    x: number,
    y: number,
    radius: number,
    damage: number,
    targets: { combatant: Combatant; camera: CombatCamera }[],
): void {
    const pending = [{ x, y, radius, damage }];
    while (pending.length > 0) {
        const boom = pending.shift();
        if (!boom) {
            break;
        }
        explosions.push({ x: boom.x, y: boom.y, radius: boom.radius, age: 0 });
        if (boom.radius <= 0 || boom.damage <= 0) {
            continue;
        }
        for (const target of targets) {
            const guns = gunsOf(target.combatant.instance);
            for (const part of target.combatant.instance.tiles) {
                if (part.health <= 0) {
                    continue;
                }
                const tile = part.tile;
                const near = localToWorld(target.camera, tile.x, tile.y);
                const far = localToWorld(target.camera, tile.x + tile.base.width, tile.y + tile.base.height);
                const minX = Math.min(near.x, far.x);
                const maxX = Math.max(near.x, far.x);
                const minY = Math.min(near.y, far.y);
                const maxY = Math.max(near.y, far.y);
                const closestX = Math.min(maxX, Math.max(minX, boom.x));
                const closestY = Math.min(maxY, Math.max(minY, boom.y));
                const distance = Math.hypot(boom.x - closestX, boom.y - closestY);
                const falloff = 1 - distance / boom.radius;
                if (falloff <= 0) {
                    continue;
                }
                part.health -= boom.damage * falloff;
                if (part.health > 0) {
                    continue;
                }
                part.health = 0;
                const gunIndex = guns.indexOf(part);
                if (gunIndex >= 0) {
                    target.combatant.guns[gunIndex].shotsLeft = 0;
                }
                const deathRadius = tile.base.explosionRadius;
                const deathDamage = tile.base.explosionDamage;
                if (deathRadius === undefined || deathDamage === undefined) {
                    continue;
                }
                const origin = tileToWorld(
                    target.camera,
                    tile.x,
                    tile.y,
                    tile.base.width,
                    tile.base.height,
                );
                pending.push({
                    x: origin.x,
                    y: origin.y,
                    radius: deathRadius,
                    damage: deathDamage,
                });
            }
        }
    }
}

export function updateCombat(): void {
    const state = getGameState();
    if (!player || !enemy || encounterEvent !== state.gameDirector.eventIndex) {
        encounterEvent = state.gameDirector.eventIndex;
        player = createCombatant(state.playerData.vehicle, "PLAYER");
        enemy = createCombatant(state.playerData.vehicle, "ENEMY");
        projectiles = [];
        explosions = [];
        lastUpdateMs = performance.now();
    }

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - lastUpdateMs) / 1000));
    lastUpdateMs = now;

    const mouse = getMousePosition();
    const leftDown = isMouseButtonDown(0);
    const leftPressed = leftDown && !leftWasDown;
    leftWasDown = leftDown;

    const viewWidth = GAME_WIDTH - ABILITY_BAR_WIDTH;
    const viewHeight = GAME_HEIGHT / 2;
    const enemyView = { x: ABILITY_BAR_WIDTH, y: 0, width: viewWidth, height: viewHeight };
    const playerView = { x: ABILITY_BAR_WIDTH, y: viewHeight, width: viewWidth, height: viewHeight };
    const enemyLayout = layoutCombatVehicle(enemy.instance, enemyView);
    const playerLayout = layoutCombatVehicle(player.instance, playerView);
    // the player center is the world origin; the enemy center is TANK_SEPARATION tiles ahead
    const playerCamera = playerLayout ? makeCombatCamera(playerLayout, playerView, false, 0, 0) : null;
    const enemyCamera = enemyLayout
        ? makeCombatCamera(enemyLayout, enemyView, true, 0, -TANK_SEPARATION)
        : null;

    const guns = gunsOf(player.instance);
    const livingGuns = guns.flatMap((gun, index) => gun.health > 0 ? [{ gun, index }] : []);
    const mouseOverEnemy = mouse.x >= enemyView.x && mouse.y >= enemyView.y
        && mouse.x < enemyView.x + enemyView.width
        && mouse.y < enemyView.y + enemyView.height;
    const mouseWorld = enemyCamera && mouseOverEnemy ? screenToWorld(enemyCamera, mouse.x, mouse.y) : null;
    let chosenAbility: number | null = null;
    let target: { x: number; y: number } | null = null;
    if (leftPressed) {
        const hit = layoutAbilityButtons(livingGuns.length).find((button) => {
            return mouse.x >= button.x
                && mouse.y >= button.y
                && mouse.x < button.x + button.width
                && mouse.y < button.y + button.height;
        });
        if (hit) {
            chosenAbility = livingGuns[hit.index].index;
        } else if (mouseWorld) {
            target = mouseWorld;
        }
    }

    updateCombatant(player, dt, { chosenAbility, target }, playerCamera);
    updateCombatant(enemy, dt, null, enemyCamera);

    // point each active gun along the world direction to its aim point
    const turretRotations = player.instance.tiles.map(() => 0);
    if (playerCamera) {
        for (let index = 0; index < guns.length; index++) {
            const runtime = player.guns[index];
            const gun = guns[index];
            if (gun.health <= 0) {
                continue;
            }
            let aim: { x: number; y: number } | null = null;
            if (runtime.shotsLeft > 0) {
                aim = { x: runtime.targetX, y: runtime.targetY };
            } else if (index === player.selectedAbility && mouseWorld) {
                aim = mouseWorld;
            } else if (runtime.hasTarget) {
                aim = { x: runtime.targetX, y: runtime.targetY };
            }
            if (!aim) {
                continue;
            }
            const origin = tileToWorld(
                playerCamera,
                gun.tile.x,
                gun.tile.y,
                gun.tile.base.width,
                gun.tile.base.height,
            );
            const tileIndex = player.instance.tiles.indexOf(gun);
            if (tileIndex >= 0) {
                turretRotations[tileIndex] = aimRotation(aim.x - origin.x, aim.y - origin.y, false);
            }
        }
    }

    drawCombatVehicle(enemy.instance, enemyView, "Enemy", true, enemy.instance.tiles.map(() => 0));
    drawCombatVehicle(player.instance, playerView, player.instance.base.name, false, turretRotations);
    drawRect({
        x: ABILITY_BAR_WIDTH,
        y: viewHeight - 1,
        width: viewWidth,
        height: 2,
        color: "#2e3546",
    });

    // move each shot through world space and show it only on a camera that can see it
    const projectileScale = (playerLayout?.cell ?? 48) / TILE_SIZE_PX * 0.5;
    const stillFlying: Projectile[] = [];
    for (const shot of projectiles) {
        shot.age += dt;
        if (shot.age >= shot.duration) {
            const targets: { combatant: Combatant; camera: CombatCamera }[] = [];
            if (playerCamera) {
                targets.push({ combatant: player, camera: playerCamera });
            }
            if (enemyCamera) {
                targets.push({ combatant: enemy, camera: enemyCamera });
            }
            detonate(shot.toX, shot.toY, shot.explosionRadius, shot.damage, targets);
            continue;
        }
        const t = shot.duration <= 0 ? 1 : shot.age / shot.duration;
        const x = shot.fromX + (shot.toX - shot.fromX) * t;
        const y = shot.fromY + (shot.toY - shot.fromY) * t;
        const worldDx = shot.toX - shot.fromX;
        const worldDy = shot.toY - shot.fromY;
        if (playerCamera) {
            drawWorldProjectile(playerCamera, x, y, worldDx, worldDy, projectileScale);
        }
        if (enemyCamera) {
            drawWorldProjectile(enemyCamera, x, y, worldDx, worldDy, projectileScale);
        }
        stillFlying.push(shot);
    }
    projectiles = stillFlying;

    // expand each burst from a speck to its radius while it fades out
    const stillBursting: Explosion[] = [];
    for (const explosion of explosions) {
        explosion.age += dt;
        const growth = explosion.age / EXPLOSION_DURATION;
        if (growth >= 1) {
            continue;
        }
        if (playerCamera) {
            drawExplosion(playerCamera, explosion, growth);
        }
        if (enemyCamera) {
            drawExplosion(enemyCamera, explosion, growth);
        }
        stillBursting.push(explosion);
    }
    explosions = stillBursting;
    setDrawClip(null);

    const selectedAbility = player.selectedAbility;
    const gunStates = player.guns;
    const selectedLiving = livingGuns.findIndex((entry) => entry.index === selectedAbility);
    drawAbilityBar(
        livingGuns.map((entry) => entry.gun),
        selectedLiving,
        livingGuns.map((entry) => gunStates[entry.index].cooldown),
    );
}
