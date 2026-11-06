import { getOverclockedTurretStats, getPowerPerSecond, getTotalPowerCapacity } from "../building/vehicleUtils";
import type { BaseVehicle } from "../building/types/vehicle";
import type { ProjectileType } from "../building/types/tiles";
import { GAME_HEIGHT, GAME_WIDTH } from "../drawing/canvas";
import {
    ABILITY_BAR_WIDTH,
    DEFEAT_EXPLOSION_RADIUS,
    DEFEAT_HEALTH_RATIO,
    DIRECT_MISS_DISTANCE,
    EXPLOSION_DURATION,
    OPENING_FIRE_DELAY,
    FAIL_DAMAGE_OF_MAX_HEALTH,
    FAIL_EXPLOSION_RADIUS,
    HIT_FLASH_DURATION,
    JAM_ENERGY_MULTIPLIER,
    REPAIR_COOLDOWN,
    REPAIR_DURATION,
    REPAIR_HEAL_PER_SECOND,
    REPAIR_RADIUS,
    REPAIR_REVIVE_RATIO,
    REPAIR_TICK_FRAMES,
    SPARK_DAMAGE_PER_SPARK,
    SPARK_DURATION,
    SPARK_MAX_PER_HIT,
    SPARK_MAX_SPEED,
    SPARK_MIN_SPEED,
    TANK_SEPARATION,
} from "./constants";
import {
    layoutCombatVehicle,
    localToWorld,
    makeCombatCamera,
    tileToWorld,
    type CombatCamera,
    type CombatViewport,
} from "./combatLayout";
import { FAULT_ICON_DURATION } from "./statusIcons";
import type { GunFault, TileInstance } from "./types/tileInstance";
import type { VehicleInstance } from "./types/vehicleInstance";

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

export interface Combatant {
    instance: VehicleInstance;
    control: CombatControl;
    selectedAbility: number;
    repairCooldown: number;
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
    projectileSprite: string;
    impactSound: string;
    /** The tank that fired this shot. Direct hits ignore its tiles. */
    owner: Combatant;
}

export interface RepairCircle {
    x: number;
    y: number;
    age: number;
    owner: Combatant;
    /** Frames since this circle last healed. */
    framesSinceTick: number;
    /** Seconds gathered since the last tick. Spent all at once so the rate matches a per-frame heal. */
    pendingDt: number;
}

export interface Explosion {
    x: number;
    y: number;
    radius: number;
    age: number;
}

export interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    duration: number;
}

interface CombatInput {
    chosenAbility: number | null;
    target: { x: number; y: number } | null;
}

/** What one tank is ordered to do on this step. Null fields leave that part alone. */
export interface CombatantOrders {
    gun: number | null;
    target: { x: number; y: number } | null;
    repair: { x: number; y: number } | null;
}

export interface BattleOrders {
    player: CombatantOrders | null;
    enemy: CombatantOrders | null;
    /** Random enemy timing. Tests leave this off and script both tanks. */
    enemyAi: boolean;
}

export interface Battle {
    player: Combatant;
    enemy: Combatant;
    projectiles: Projectile[];
    explosions: Explosion[];
    sparks: Spark[];
    repairs: RepairCircle[];
    /** Sound names queued this step. The combat screen plays and clears them. */
    sounds: string[];
    result: "victory" | "defeat" | null;
    /** Catalog bounty for defeating this enemy. Paid only on victory. */
    moneyDropped: number;
    enemyActionDelay: number;
    /** Seconds left before either tank is allowed to start a shot. */
    openingFireDelay: number;
    time: number;
}

export interface BattleView {
    playerView: CombatViewport;
    enemyView: CombatViewport;
    playerCamera: CombatCamera | null;
    enemyCamera: CombatCamera | null;
}

export interface CombatTileState {
    name: string;
    x: number;
    y: number;
    health: number;
    maxHealth: number;
    /** 1 is full white, 0 is the tile's normal color. */
    flash: number;
    /** 1 is full green, 0 is the tile's normal color. */
    healFlash: number;
    fault: GunFault | null;
    faultAge: number;
}

export interface CombatSideState {
    healthRatio: number | null;
    energy: number;
    repairCooldown: number;
    tiles: CombatTileState[];
}

/** The fight after the steps so far. `winner` is who is still standing. */
export interface CombatState {
    time: number;
    winner: "player" | "enemy" | null;
    /** Bounty gained for this fight. Zero until the player wins. */
    moneyDropped: number;
    player: CombatSideState;
    enemy: CombatSideState;
    sparks: { x: number; y: number }[];
    /** Sound names queued since the fight started, until the combat screen plays them. */
    sounds: string[];
}

export function gunsOf(instance: VehicleInstance): TileInstance[] {
    return instance.tiles.filter((part) => part.tile.base.turret !== undefined);
}

/** Capacity and generation from living parts, using the same base as the builder. */
export function energyBudget(instance: VehicleInstance): { capacity: number; generation: number } {
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
export function healthRatio(instance: VehicleInstance): number | null {
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
            hitFlash: 0,
            healFlash: 0,
            fault: null,
            faultAge: 0,
        })),
        power: getTotalPowerCapacity(base),
    };
    return {
        instance,
        control,
        selectedAbility: -1,
        repairCooldown: 0,
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

/** The same cameras the combat screen uses, so scripted aim points match the game. */
export function battleView(battle: Battle): BattleView {
    const viewWidth = GAME_WIDTH - ABILITY_BAR_WIDTH;
    const viewHeight = GAME_HEIGHT / 2;
    const playerView = { x: ABILITY_BAR_WIDTH, y: viewHeight, width: viewWidth, height: viewHeight };
    const enemyView = { x: ABILITY_BAR_WIDTH, y: 0, width: viewWidth, height: viewHeight };
    const playerLayout = layoutCombatVehicle(battle.player.instance, playerView);
    const enemyLayout = layoutCombatVehicle(battle.enemy.instance, enemyView);
    return {
        playerView,
        enemyView,
        playerCamera: playerLayout ? makeCombatCamera(playerLayout, playerView, false, 0, 0) : null,
        enemyCamera: enemyLayout
            ? makeCombatCamera(enemyLayout, enemyView, true, 0, -TANK_SEPARATION)
            : null,
    };
}

/** World center of a tile. Scripts aim here. */
export function tileWorldCenter(battle: Battle, side: "player" | "enemy", tileIndex: number): { x: number; y: number } {
    const view = battleView(battle);
    const combatant = side === "player" ? battle.player : battle.enemy;
    const camera = side === "player" ? view.playerCamera : view.enemyCamera;
    const part = combatant.instance.tiles[tileIndex];
    if (!camera || !part) {
        throw new Error(`No ${side} tile at index ${tileIndex}`);
    }
    return tileToWorld(camera, part.tile.x, part.tile.y, part.tile.base.width, part.tile.base.height);
}

export function combatSnapshot(battle: Battle): CombatState {
    return {
        time: battle.time,
        winner: battle.result === "victory" ? "player" : battle.result === "defeat" ? "enemy" : null,
        moneyDropped: battle.result === "victory" ? battle.moneyDropped : 0,
        player: sideState(battle.player),
        enemy: sideState(battle.enemy),
        sparks: battle.sparks.map((spark) => ({ x: spark.x, y: spark.y })),
        sounds: battle.sounds.slice(),
    };
}

function sideState(combatant: Combatant): CombatSideState {
    return {
        healthRatio: healthRatio(combatant.instance),
        energy: combatant.instance.power,
        repairCooldown: combatant.repairCooldown,
        tiles: combatant.instance.tiles.map((part) => ({
            name: part.tile.base.tileName,
            x: part.tile.x,
            y: part.tile.y,
            health: part.health,
            maxHealth: part.tile.base.health,
            flash: part.hitFlash <= 0 ? 0 : Math.min(1, part.hitFlash / HIT_FLASH_DURATION),
            healFlash: part.healFlash <= 0 ? 0 : Math.min(1, part.healFlash / HIT_FLASH_DURATION),
            fault: part.fault,
            faultAge: part.faultAge,
        })),
    };
}

/** After the wait, fire one ready gun at a random living tile. Otherwise wait again. */
function enemyCombatInput(
    battle: Battle,
    attacker: Combatant,
    targetTank: Combatant,
    targetCamera: CombatCamera | null,
    dt: number,
): CombatInput | null {
    battle.enemyActionDelay -= dt;
    if (battle.enemyActionDelay > 0) {
        return null;
    }
    battle.enemyActionDelay = randomEnemyDelay();
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

/** True when any part of the tile is inside the circle. */
function tileInsideCircle(
    camera: CombatCamera,
    part: TileInstance,
    x: number,
    y: number,
    radius: number,
): boolean {
    const tile = part.tile;
    const near = localToWorld(camera, tile.x, tile.y);
    const far = localToWorld(camera, tile.x + tile.base.width, tile.y + tile.base.height);
    const minX = Math.min(near.x, far.x);
    const maxX = Math.max(near.x, far.x);
    const minY = Math.min(near.y, far.y);
    const maxY = Math.max(near.y, far.y);
    const closestX = Math.min(maxX, Math.max(minX, x));
    const closestY = Math.min(maxY, Math.max(minY, y));
    return Math.hypot(x - closestX, y - closestY) <= radius;
}

/** Living tiles heal on each tick. Destroyed tiles are restored on those same ticks. */
function updateRepairs(
    battle: Battle,
    dt: number,
    playerCamera: CombatCamera | null,
    enemyCamera: CombatCamera | null,
): void {
    const stillActive: RepairCircle[] = [];
    for (const circle of battle.repairs) {
        circle.age += dt;
        circle.framesSinceTick += 1;
        circle.pendingDt += dt;
        const finished = circle.age >= REPAIR_DURATION - 1e-6;
        const tick = circle.framesSinceTick >= REPAIR_TICK_FRAMES || finished;
        const camera = circle.owner === battle.player ? playerCamera : enemyCamera;
        if (tick && camera) {
            for (const part of circle.owner.instance.tiles) {
                if (!tileInsideCircle(camera, part, circle.x, circle.y, REPAIR_RADIUS)) {
                    continue;
                }
                const maxHealth = part.tile.base.health;
                if (maxHealth <= 0) {
                    continue;
                }
                const before = part.health;
                if (part.health <= 0) {
                    part.health = maxHealth * REPAIR_REVIVE_RATIO;
                } else {
                    part.health = Math.min(maxHealth, part.health + maxHealth * REPAIR_HEAL_PER_SECOND * circle.pendingDt);
                }
                if (part.health > before) {
                    part.healFlash = HIT_FLASH_DURATION;
                }
            }
        }
        if (tick) {
            circle.framesSinceTick = 0;
            circle.pendingDt = 0;
        }
        if (!finished) {
            stillActive.push(circle);
        }
    }
    battle.repairs = stillActive;
}

/** Player and enemy share this update. Only the supplied input can start a shot. */
function updateCombatant(
    battle: Battle,
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
                    runtime.cooldown = Math.max(0, stats.reloadTime);
                    break;
                }
                const jammed = Math.random() < Math.max(0, stats.jamChance);
                const failed = Math.random() < Math.max(0, stats.failChance);
                if (jammed || failed) {
                    const spent = jammed ? cost * JAM_ENERGY_MULTIPLIER : cost;
                    combatant.instance.power = Math.max(0, combatant.instance.power - spent);
                    runtime.shotsLeft = 0;
                    runtime.cooldown = Math.max(0, stats.reloadTime);
                    gun.fault = failed ? "fail" : "jam";
                    gun.faultAge = 0;
                    cueSound(battle, "weapons/weapon_jam");
                    if (failed) {
                        const origin = tileToWorld(
                            ownCamera,
                            gun.tile.x,
                            gun.tile.y,
                            gun.tile.base.width,
                            gun.tile.base.height,
                        );
                        detonate(
                            battle,
                            origin.x,
                            origin.y,
                            FAIL_EXPLOSION_RADIUS,
                            gun.tile.base.health * FAIL_DAMAGE_OF_MAX_HEALTH,
                            battleTargets(battle),
                        );
                    }
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
                battle.projectiles.push({
                    fromX: origin.x,
                    fromY: origin.y,
                    toX: endX,
                    toY: endY,
                    age: 0,
                    duration: travel / speed,
                    explosionRadius: Math.max(0, stats.explosionRadius),
                    damage: Math.max(0, stats.damagePerShot),
                    projectileType: turret.projectileType,
                    projectileSprite: turret.projectileSprite || "weapons/bullet",
                    impactSound: turret.impactSound,
                    owner: combatant,
                });
                cueSound(battle, turret.firingSound);
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
            if (runtime.cooldown === 0 && combatant.control === "PLAYER") {
                cueSound(battle, "combat/weapon_ready");
            }
        }
    }
}

function battleTargets(battle: Battle): { combatant: Combatant; camera: CombatCamera }[] {
    const view = battleView(battle);
    const targets: { combatant: Combatant; camera: CombatCamera }[] = [];
    if (view.playerCamera) {
        targets.push({ combatant: battle.player, camera: view.playerCamera });
    }
    if (view.enemyCamera) {
        targets.push({ combatant: battle.enemy, camera: view.enemyCamera });
    }
    return targets;
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

/** Sparks fly out from the tile, with more of them for a harder hit. */
function spawnSparks(battle: Battle, x: number, y: number, damage: number): void {
    if (damage <= 0) {
        return;
    }
    const count = Math.min(SPARK_MAX_PER_HIT, Math.max(1, Math.round(damage / SPARK_DAMAGE_PER_SPARK)));
    for (let index = 0; index < count; index++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = SPARK_MIN_SPEED + Math.random() * (SPARK_MAX_SPEED - SPARK_MIN_SPEED);
        battle.sparks.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            age: 0,
            duration: SPARK_DURATION,
        });
    }
}

/** Wipe whatever is left of a beaten tank and burst it from the center. */
function destroyDefeatedTank(battle: Battle, combatant: Combatant, camera: CombatCamera | null): void {
    for (const part of combatant.instance.tiles) {
        if (part.health > 0) {
            flashTile(part);
            if (camera) {
                const origin = tileToWorld(camera, part.tile.x, part.tile.y, part.tile.base.width, part.tile.base.height);
                spawnSparks(battle, origin.x, origin.y, part.health);
            }
        }
        part.health = 0;
    }
    for (const gun of combatant.guns) {
        gun.shotsLeft = 0;
    }
    if (!camera) {
        return;
    }
    battle.explosions.push({
        x: camera.worldX,
        y: camera.worldY,
        radius: DEFEAT_EXPLOSION_RADIUS,
        age: 0,
    });
    cueExplosion(battle, DEFEAT_EXPLOSION_RADIUS);
}

/** Damage every living tile in range, and let destroyed explosive tiles burst too. */
function detonate(
    battle: Battle,
    x: number,
    y: number,
    radius: number,
    damage: number,
    targets: { combatant: Combatant; camera: CombatCamera }[],
    /** The projectile's impact clip is already this blast, so don't play it twice. */
    quietFirst = false,
): void {
    const pending = [{ x, y, radius, damage, silent: quietFirst }];
    while (pending.length > 0) {
        const boom = pending.shift();
        if (!boom) {
            break;
        }
        battle.explosions.push({ x: boom.x, y: boom.y, radius: boom.radius, age: 0 });
        if (!boom.silent) {
            cueExplosion(battle, boom.radius);
        }
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
                const dealt = Math.min(part.health, boom.damage * falloff);
                part.health -= dealt;
                if (dealt > 0) {
                    flashTile(part);
                }
                const origin = tileToWorld(
                    target.camera,
                    tile.x,
                    tile.y,
                    tile.base.width,
                    tile.base.height,
                );
                spawnSparks(battle, origin.x, origin.y, dealt);
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
                pending.push({
                    x: origin.x,
                    y: origin.y,
                    radius: deathRadius,
                    damage: deathDamage,
                    silent: false,
                });
            }
        }
    }
}

/** Drop the aim point while the opening delay is running, so a click cannot start a shot. */
function holdFire(input: CombatInput | null, locked: boolean): CombatInput | null {
    if (!input || !locked) {
        return input;
    }
    return { chosenAbility: input.chosenAbility, target: null };
}

function ordersToInput(orders: CombatantOrders | null): CombatInput | null {
    if (!orders) {
        return null;
    }
    return { chosenAbility: orders.gun, target: orders.target };
}

function placeRepair(combatant: Combatant, battle: Battle, point: { x: number; y: number } | null): void {
    if (!point || combatant.repairCooldown > 0) {
        return;
    }
    battle.repairs.push({ x: point.x, y: point.y, age: 0, owner: combatant, framesSinceTick: 0, pendingDt: 0 });
    combatant.repairCooldown = REPAIR_COOLDOWN;
    if (combatant.control === "PLAYER") {
        cueSound(battle, "combat/repair");
    }
}

export function createBattle(playerVehicle: BaseVehicle, enemyVehicle: BaseVehicle, moneyDropped = 0): Battle {
    return {
        player: createCombatant(playerVehicle, "PLAYER"),
        enemy: createCombatant(enemyVehicle, "ENEMY"),
        projectiles: [],
        explosions: [],
        sparks: [],
        repairs: [],
        sounds: [],
        result: null,
        moneyDropped,
        enemyActionDelay: randomEnemyDelay(),
        openingFireDelay: OPENING_FIRE_DELAY,
        time: 0,
    };
}

function cueSound(battle: Battle, name: string | undefined): void {
    if (name) {
        battle.sounds.push(name);
    }
}

/** A blast under this radius uses the smaller explosion clip. */
const SMALL_EXPLOSION_RADIUS = 3;

function cueExplosion(battle: Battle, radius: number): void {
    if (radius <= 0) {
        return;
    }
    cueSound(battle, radius < SMALL_EXPLOSION_RADIUS ? "weapons/explosion_small" : "weapons/explosion");
}

function explosionImpact(name: string | undefined): boolean {
    return name === "weapons/explosion" || name === "weapons/explosion_small";
}

function flashTile(part: TileInstance): void {
    part.hitFlash = HIT_FLASH_DURATION;
}

function ageHitFlashes(battle: Battle, dt: number): void {
    for (const combatant of [battle.player, battle.enemy]) {
        for (const part of combatant.instance.tiles) {
            const next = part.hitFlash - dt;
            part.hitFlash = next <= 1e-8 ? 0 : next;
            const healed = part.healFlash - dt;
            part.healFlash = healed <= 1e-8 ? 0 : healed;
            if (part.fault) {
                part.faultAge += dt;
                if (part.faultAge >= FAULT_ICON_DURATION - 1e-6) {
                    part.fault = null;
                    part.faultAge = 0;
                }
            }
        }
    }
}

/** Advance the fight by `dt` seconds. Orders are ignored once someone has lost. */
export function stepBattle(battle: Battle, dt: number, orders: BattleOrders): void {
    ageHitFlashes(battle, dt);
    const view = battleView(battle);
    const fightOver = battle.result !== null;
    battle.player.repairCooldown = Math.max(0, battle.player.repairCooldown - dt);
    battle.enemy.repairCooldown = Math.max(0, battle.enemy.repairCooldown - dt);
    if (!fightOver) {
        placeRepair(battle.player, battle, orders.player?.repair ?? null);
        placeRepair(battle.enemy, battle, orders.enemy?.repair ?? null);
    }

    const firingLocked = battle.openingFireDelay > 0;
    if (firingLocked) {
        battle.openingFireDelay = Math.max(0, battle.openingFireDelay - dt);
        if (orders.enemyAi) {
            battle.enemyActionDelay = Math.max(0, battle.enemyActionDelay - dt);
        }
    }
    const playerInput = fightOver ? null : holdFire(ordersToInput(orders.player), firingLocked);
    updateCombatant(battle, battle.player, dt, playerInput, view.playerCamera);
    const enemyInput = fightOver
        ? null
        : orders.enemy
            ? holdFire(ordersToInput(orders.enemy), firingLocked)
            : firingLocked || !orders.enemyAi
                ? null
                : enemyCombatInput(battle, battle.enemy, battle.player, view.playerCamera, dt);
    updateCombatant(battle, battle.enemy, dt, enemyInput, view.enemyCamera);

    const targets: { combatant: Combatant; camera: CombatCamera }[] = [];
    if (view.playerCamera) {
        targets.push({ combatant: battle.player, camera: view.playerCamera });
    }
    if (view.enemyCamera) {
        targets.push({ combatant: battle.enemy, camera: view.enemyCamera });
    }
    const stillFlying: Projectile[] = [];
    for (const shot of battle.projectiles) {
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
            cueSound(battle, shot.impactSound);
            detonate(
                battle,
                shot.fromX + (shot.toX - shot.fromX) * impactT,
                shot.fromY + (shot.toY - shot.fromY) * impactT,
                shot.explosionRadius,
                shot.damage,
                targets,
                explosionImpact(shot.impactSound),
            );
            continue;
        }
        stillFlying.push(shot);
    }
    battle.projectiles = stillFlying;

    updateRepairs(battle, dt, view.playerCamera, view.enemyCamera);

    if (!fightOver) {
        const playerHealthNow = healthRatio(battle.player.instance);
        const enemyHealthNow = healthRatio(battle.enemy.instance);
        if (enemyHealthNow !== null && enemyHealthNow < DEFEAT_HEALTH_RATIO) {
            battle.result = "victory";
            destroyDefeatedTank(battle, battle.enemy, view.enemyCamera);
        } else if (playerHealthNow !== null && playerHealthNow < DEFEAT_HEALTH_RATIO) {
            battle.result = "defeat";
            destroyDefeatedTank(battle, battle.player, view.playerCamera);
        }
    }

    const stillBursting: Explosion[] = [];
    for (const explosion of battle.explosions) {
        explosion.age += dt;
        if (explosion.age < EXPLOSION_DURATION) {
            stillBursting.push(explosion);
        }
    }
    battle.explosions = stillBursting;
    const stillSparking: Spark[] = [];
    for (const spark of battle.sparks) {
        spark.age += dt;
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        if (spark.age < spark.duration) {
            stillSparking.push(spark);
        }
    }
    battle.sparks = stillSparking;
    battle.time += dt;
}
