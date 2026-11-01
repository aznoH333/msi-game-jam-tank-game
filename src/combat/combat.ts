import { TILE_SIZE_PX, type ProjectileType } from "../building/types/tiles";
import { getOverclockedTurretStats, getPowerPerSecond, getTotalPowerCapacity } from "../building/vehicleUtils";
import type { BaseVehicle } from "../building/types/vehicle";
import { drawRect, GAME_HEIGHT, GAME_WIDTH, getDrawClip, setDrawClip } from "../drawing/canvas";
import { drawText } from "../drawing/text";
import { drawSprite, getSpriteSize } from "../drawing/sprites";
import { getGameState } from "../game/gameState";
import { pickEnemyVehicle } from "../gamedirector/constants/enemyCatalog";
import { loseCombat, transitionToNextEvent } from "../gamedirector/gamedirector";
import { getMousePosition, isMouseButtonDown } from "../input/input";
import { ABILITY_BAR_WIDTH, drawAbilityBar, drawEnergyReadout, drawHealthBar, layoutAbilityButtons } from "./abilityBar";
import { DEFEAT_EXPLOSION_RADIUS, DEFEAT_HEALTH_RATIO, DIRECT_MISS_DISTANCE, EXPLOSION_DURATION, TANK_SEPARATION } from "./constants";
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
const ENEMY_ACTION_MIN = 1;
const ENEMY_ACTION_MAX = 2;

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
    projectileType: ProjectileType;
    /** The tank that fired this shot. Direct hits ignore its tiles. */
    owner: Combatant;
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
let combatResult: "victory" | "defeat" | null = null;
let leftWasDown = false;
let lastUpdateMs = 0;
let projectiles: Projectile[] = [];
let explosions: Explosion[] = [];
let enemyActionDelay = 0;

function gunsOf(instance: VehicleInstance): TileInstance[] {
    return instance.tiles.filter((part) => part.tile.base.turret !== undefined);
}

/** Capacity and generation from living parts, using the same base as the builder. */
function energyBudget(instance: VehicleInstance): { capacity: number; generation: number } {
    let capacity = getTotalPowerCapacity(instance.base);
    let generation = getPowerPerSecond(instance.base);
    for (const part of instance.tiles) {
        if (part.health > 0) {
            continue;
        }
        capacity -= part.tile.base.powerCapacity ?? 0;
        generation -= part.tile.base.powerGenerationPerSecond ?? 0;
    }
    return {
        capacity: Math.max(0, capacity),
        generation: Math.max(0, generation),
    };
}

/** Share of hit points still left. Null when the vehicle has no hit points to lose. */
function healthRatio(instance: VehicleInstance): number | null {
    let current = 0;
    let max = 0;
    for (const part of instance.tiles) {
        max += part.tile.base.health;
        current += Math.max(0, part.health);
    }
    if (max <= 0) {
        return null;
    }
    return current / max;
}

function rechargeEnergy(instance: VehicleInstance, dt: number): void {
    const budget = energyBudget(instance);
    instance.power = Math.min(budget.capacity, Math.max(0, instance.power + budget.generation * dt));
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

function randomEnemyDelay(): number {
    return ENEMY_ACTION_MIN + Math.random() * (ENEMY_ACTION_MAX - ENEMY_ACTION_MIN);
}

/** After the wait, fire one ready gun at a random living tile. Otherwise wait again. */
function enemyCombatInput(
    attacker: Combatant,
    targetTank: Combatant,
    targetCamera: CombatCamera | null,
    dt: number,
): CombatInput | null {
    enemyActionDelay -= dt;
    if (enemyActionDelay > 0) {
        return null;
    }
    enemyActionDelay = randomEnemyDelay();
    if (!targetCamera) {
        return null;
    }

    const guns = gunsOf(attacker.instance);
    const ready: number[] = [];
    for (let index = 0; index < guns.length; index++) {
        const gun = guns[index];
        const runtime = attacker.guns[index];
        const turret = gun.tile.base.turret;
        if (!turret || gun.health <= 0 || runtime.shotsLeft > 0 || runtime.cooldown > 0) {
            continue;
        }
        const stats = getOverclockedTurretStats(turret, gun.tile.overclocks);
        const count = Math.max(0, Math.round(stats.salvoCount));
        const cost = Math.max(0, stats.powerPerShot);
        if (count > 0 && attacker.instance.power >= cost) {
            ready.push(index);
        }
    }
    const livingTiles = targetTank.instance.tiles.filter((part) => part.health > 0);
    if (ready.length === 0 || livingTiles.length === 0) {
        return null;
    }

    const gunIndex = ready[Math.floor(Math.random() * ready.length)];
    const part = livingTiles[Math.floor(Math.random() * livingTiles.length)];
    return {
        chosenAbility: gunIndex,
        target: tileToWorld(
            targetCamera,
            part.tile.x,
            part.tile.y,
            part.tile.base.width,
            part.tile.base.height,
        ),
    };
}

/** Point each gun that has an aim point along the world direction to it. */
function turretAimRotations(
    combatant: Combatant,
    camera: CombatCamera | null,
    hover: { x: number; y: number } | null,
): number[] {
    const rotations = combatant.instance.tiles.map(() => 0);
    if (!camera) {
        return rotations;
    }
    const guns = gunsOf(combatant.instance);
    for (let index = 0; index < guns.length; index++) {
        const runtime = combatant.guns[index];
        const gun = guns[index];
        if (gun.health <= 0) {
            continue;
        }
        let aim: { x: number; y: number } | null = null;
        if (runtime.shotsLeft > 0) {
            aim = { x: runtime.targetX, y: runtime.targetY };
        } else if (index === combatant.selectedAbility && hover) {
            aim = hover;
        } else if (runtime.hasTarget) {
            aim = { x: runtime.targetX, y: runtime.targetY };
        }
        if (!aim) {
            continue;
        }
        const origin = tileToWorld(
            camera,
            gun.tile.x,
            gun.tile.y,
            gun.tile.base.width,
            gun.tile.base.height,
        );
        const tileIndex = combatant.instance.tiles.indexOf(gun);
        if (tileIndex >= 0) {
            rotations[tileIndex] = aimRotation(aim.x - origin.x, aim.y - origin.y, camera.inverted);
        }
    }
    return rotations;
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
    const previousClip = getDrawClip();
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
    setDrawClip(previousClip);
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
    const previousClip = getDrawClip();
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
    setDrawClip(previousClip);
}

/** Player and enemy share this update. Only the supplied input can start a shot. */
function updateCombatant(
    combatant: Combatant,
    dt: number,
    input: CombatInput | null,
    ownCamera: CombatCamera | null,
): void {
    rechargeEnergy(combatant.instance, dt);
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
            const cost = Math.max(0, stats.powerPerShot);
            if (count > 0 && combatant.instance.power >= cost) {
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
                const cost = Math.max(0, stats.powerPerShot);
                if (combatant.instance.power < cost) {
                    runtime.shotsLeft = 0;
                    break;
                }
                combatant.instance.power -= cost;
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
                const aimDistance = Math.hypot(toX - origin.x, toY - origin.y);
                let endX = toX;
                let endY = toY;
                let travel = aimDistance;
                if (turret.projectileType === "direct" && aimDistance > 0.001) {
                    travel = aimDistance + DIRECT_MISS_DISTANCE;
                    const scale = travel / aimDistance;
                    endX = origin.x + (toX - origin.x) * scale;
                    endY = origin.y + (toY - origin.y) * scale;
                }
                projectiles.push({
                    fromX: origin.x,
                    fromY: origin.y,
                    toX: endX,
                    toY: endY,
                    age: 0,
                    duration: travel / speed,
                    explosionRadius: Math.max(0, stats.explosionRadius),
                    damage: Math.max(0, stats.damagePerShot),
                    projectileType: turret.projectileType,
                    owner: combatant,
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

/** First time a shot enters a living tile on a tank other than the one that fired it. */
function earliestTileHit(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    afterT: number,
    owner: Combatant,
    targets: { combatant: Combatant; camera: CombatCamera }[],
): number | null {
    const dx = toX - fromX;
    const dy = toY - fromY;
    let best: number | null = null;
    for (const target of targets) {
        if (target.combatant === owner) {
            continue;
        }
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
            let tMin = 0;
            let tMax = 1;
            if (Math.abs(dx) < 1e-8) {
                if (fromX < minX || fromX > maxX) {
                    continue;
                }
            } else {
                let enter = (minX - fromX) / dx;
                let exit = (maxX - fromX) / dx;
                if (enter > exit) {
                    const swap = enter;
                    enter = exit;
                    exit = swap;
                }
                tMin = Math.max(tMin, enter);
                tMax = Math.min(tMax, exit);
            }
            if (Math.abs(dy) < 1e-8) {
                if (fromY < minY || fromY > maxY) {
                    continue;
                }
            } else {
                let enter = (minY - fromY) / dy;
                let exit = (maxY - fromY) / dy;
                if (enter > exit) {
                    const swap = enter;
                    enter = exit;
                    exit = swap;
                }
                tMin = Math.max(tMin, enter);
                tMax = Math.min(tMax, exit);
            }
            if (tMin > tMax || tMin <= afterT || tMin > 1) {
                continue;
            }
            if (best === null || tMin < best) {
                best = tMin;
            }
        }
    }
    return best;
}

/** Wipe whatever is left of a beaten tank and burst it from the center. */
function destroyDefeatedTank(combatant: Combatant, camera: CombatCamera | null): void {
    for (const part of combatant.instance.tiles) {
        part.health = 0;
    }
    for (const gun of combatant.guns) {
        gun.shotsLeft = 0;
    }
    if (!camera) {
        return;
    }
    explosions.push({
        x: camera.worldX,
        y: camera.worldY,
        radius: DEFEAT_EXPLOSION_RADIUS,
        age: 0,
    });
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
        enemy = createCombatant(pickEnemyVehicle(encounterEvent), "ENEMY");
        projectiles = [];
        explosions = [];
        combatResult = null;
        enemyActionDelay = randomEnemyDelay();
        lastUpdateMs = performance.now();
    }

    const fightOver = combatResult !== null;
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
    if (!fightOver && leftPressed) {
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
    const enemyInput = fightOver || !enemyCamera
        ? null
        : enemyCombatInput(enemy, player, playerCamera, dt);
    updateCombatant(enemy, dt, enemyInput, enemyCamera);

    const turretRotations = turretAimRotations(player, playerCamera, mouseWorld);
    const enemyRotations = turretAimRotations(enemy, enemyCamera, null);

    // move each shot through world space and show it only on a camera that can see it
    const projectileScale = (playerLayout?.cell ?? 48) / TILE_SIZE_PX * 0.5;
    const targets: { combatant: Combatant; camera: CombatCamera }[] = [];
    if (playerCamera) {
        targets.push({ combatant: player, camera: playerCamera });
    }
    if (enemyCamera) {
        targets.push({ combatant: enemy, camera: enemyCamera });
    }
    const stillFlying: Projectile[] = [];
    for (const shot of projectiles) {
        const prevAge = shot.age;
        shot.age += dt;
        const prevT = shot.duration <= 0 ? 1 : Math.min(1, prevAge / shot.duration);
        const nextT = shot.duration <= 0 ? 1 : Math.min(1, shot.age / shot.duration);
        let impactT: number | null = shot.projectileType === "mortar" && nextT >= 1 ? 1 : null;
        if (shot.projectileType === "direct") {
            const hit = earliestTileHit(shot.fromX, shot.fromY, shot.toX, shot.toY, prevT, shot.owner, targets);
            if (hit !== null && hit <= nextT) {
                impactT = hit;
            } else if (nextT >= 1) {
                continue;
            }
        }
        if (impactT !== null) {
            detonate(
                shot.fromX + (shot.toX - shot.fromX) * impactT,
                shot.fromY + (shot.toY - shot.fromY) * impactT,
                shot.explosionRadius,
                shot.damage,
                targets,
            );
            continue;
        }
        const t = nextT;
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

    if (!fightOver) {
        const playerHealthNow = healthRatio(player.instance);
        const enemyHealthNow = healthRatio(enemy.instance);
        if (enemyHealthNow !== null && enemyHealthNow < DEFEAT_HEALTH_RATIO) {
            combatResult = "victory";
            destroyDefeatedTank(enemy, enemyCamera);
        } else if (playerHealthNow !== null && playerHealthNow < DEFEAT_HEALTH_RATIO) {
            combatResult = "defeat";
            destroyDefeatedTank(player, playerCamera);
        }
    }

    drawCombatVehicle(enemy.instance, enemyView, "Enemy", true, enemyRotations);
    drawCombatVehicle(player.instance, playerView, player.instance.base.name, false, turretRotations);
    drawRect({
        x: ABILITY_BAR_WIDTH,
        y: viewHeight - 1,
        width: viewWidth,
        height: 2,
        color: "#2e3546",
    });

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
    rechargeEnergy(player.instance, 0);
    rechargeEnergy(enemy.instance, 0);

    const selectedAbility = player.selectedAbility;
    const gunStates = player.guns;
    const selectedLiving = livingGuns.findIndex((entry) => entry.index === selectedAbility);
    drawAbilityBar(
        livingGuns.map((entry) => entry.gun),
        selectedLiving,
        livingGuns.map((entry) => gunStates[entry.index].cooldown),
    );
    const playerEnergy = energyBudget(player.instance);
    const enemyEnergy = energyBudget(enemy.instance);
    drawEnergyReadout(
        16,
        GAME_HEIGHT - 72,
        ABILITY_BAR_WIDTH - 32,
        player.instance.power,
        playerEnergy.capacity,
        playerEnergy.generation,
    );
    drawEnergyReadout(
        enemyView.x + enemyView.width - 220,
        enemyView.y + 16,
        200,
        enemy.instance.power,
        enemyEnergy.capacity,
        enemyEnergy.generation,
    );
    const playerHealth = healthRatio(player.instance);
    const enemyHealth = healthRatio(enemy.instance);
    drawHealthBar(playerView.x + 24, playerView.y + 52, 240, playerHealth ?? 0);
    drawHealthBar(enemyView.x + 24, enemyView.y + 52, 240, enemyHealth ?? 0);

    if (!combatResult) {
        return;
    }

    const panel = resultPanelBounds(viewWidth);
    drawRect({
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height,
        color: "#1b1f2a",
    });
    drawText({
        text: combatResult === "victory" ? "Victory" : "Defeat",
        x: panel.x + panel.width / 2,
        y: panel.y + 58,
        font: "42px sans-serif",
        color: combatResult === "victory" ? "#8ee0a8" : "#f0a198",
        align: "center",
        baseline: "middle",
    });
    const button = {
        x: panel.x + panel.width / 2 - 90,
        y: panel.y + panel.height - 72,
        width: 180,
        height: 52,
    };
    drawRect({
        x: button.x,
        y: button.y,
        width: button.width,
        height: button.height,
        color: "#2f9e44",
    });
    drawText({
        text: "Proceed",
        x: button.x + button.width / 2,
        y: button.y + button.height / 2,
        font: "22px sans-serif",
        color: "#f4fff6",
        align: "center",
        baseline: "middle",
    });
    if (
        fightOver
        && leftPressed
        && mouse.x >= button.x
        && mouse.y >= button.y
        && mouse.x < button.x + button.width
        && mouse.y < button.y + button.height
    ) {
        if (combatResult === "victory") {
            transitionToNextEvent();
        } else {
            loseCombat();
        }
    }
}

function resultPanelBounds(viewWidth: number): { x: number; y: number; width: number; height: number } {
    const width = 420;
    const height = 200;
    return {
        x: ABILITY_BAR_WIDTH + viewWidth / 2 - width / 2,
        y: GAME_HEIGHT / 2 - height / 2,
        width,
        height,
    };
}
