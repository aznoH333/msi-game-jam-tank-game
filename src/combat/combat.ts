import { playSound, setEngineBlend } from "../audio/audio";
import { TILE_SIZE_PX } from "../building/types/tiles";
import { placedWeaponCount } from "../building/vehicleRules";
import { getOverclockedTurretStats } from "../building/vehicleUtils";
import { drawCircle, drawRect, GAME_HEIGHT, getDrawClip, setDrawClip } from "../drawing/canvas";
import { drawText } from "../drawing/text";
import { drawSprite, getSpriteSize } from "../drawing/sprites";
import { openGameOver } from "../game/gameOver";
import { getGameState } from "../game/gameState";
import { pickEnemyVehicle } from "../gamedirector/constants/enemyCatalog";
import { directorAttempt, getEventTypeForIndex, transitionToNextEvent } from "../gamedirector/gamedirector";
import { getMousePosition, isKeyDown, isMouseButtonDown } from "../input/input";
import { ABILITY_BAR_WIDTH, drawAbilityBar, drawAbilityBarMoney, drawHealthBar, drawViewEnergy, layoutAbilityButtons, repairButtonBounds } from "./abilityBar";
import {
    battleView,
    createBattle,
    energyBudget,
    gunsOf,
    healthRatio,
    stepBattle,
    type Battle,
    type Combatant,
    type CombatantOrders,
    type Explosion,
    type Spark,
} from "./battle";
import { EXPLOSION_DURATION, REPAIR_RADIUS } from "./constants";
import { combatActionAllowed, combatGunSelectAllowed, dialogBlocksEnemies, dialogBlocksPlayer, notifyPlayerFired, startFirstCombatTutorial } from "../ui/textCard";
import { iconFlashAlpha } from "./statusIcons";
import {
    aimRotation,
    drawCombatVehicle,
    screenToWorld,
    tileToWorld,
    worldToScreen,
    type CombatCamera,
} from "./combatView";

const EXPLOSION_SPRITE = "combat/debug_explosion";
const REPAIR_ICON = "combat/repair_icon";
const ATTACK_RANGE_FILL = "rgba(214, 64, 52, 0.28)";
const ATTACK_RANGE_STROKE = "rgba(255, 120, 108, 0.95)";
const REPAIR_RANGE_FILL = "rgba(63, 190, 110, 0.28)";
const REPAIR_RANGE_STROKE = "rgba(170, 235, 190, 0.95)";
/** Screen pixels of shake for each tile of explosion radius. */
const SHAKE_PIXELS_PER_TILE = 8;
/** How fast the shake falls off. Larger fades sooner. */
const SHAKE_DECAY = 10;

interface ViewShake {
    magnitude: number;
    x: number;
    y: number;
}

let playerViewShake: ViewShake = { magnitude: 0, x: 0, y: 0 };
let enemyViewShake: ViewShake = { magnitude: 0, x: 0, y: 0 };
const WEAPON_KEY_COUNT = 9;

let encounterEvent = -1;
let combatAttempt = -1;
let battle: Battle | null = null;
let moneyAwarded = false;
let leftWasDown = false;
let lastUpdateMs = 0;
let targetingRepair = false;
const weaponKeyWasDown = Array.from({ length: WEAPON_KEY_COUNT }, () => false);
let repairKeyWasDown = false;


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

/** A filled circle in world tiles, clipped to the camera that is showing it. */
function drawRangeCircle(
    camera: CombatCamera,
    worldX: number,
    worldY: number,
    radius: number,
    color: string,
    strokeColor: string,
): void {
    const screen = worldToScreen(camera, worldX, worldY);
    const previousClip = getDrawClip();
    setDrawClip({ x: camera.view.x, y: camera.view.y, width: camera.view.width, height: camera.view.height });
    drawCircle({
        x: screen.x,
        y: screen.y,
        radius: radius * camera.layout.cell,
        color,
        strokeColor,
        lineWidth: 2,
    });
    setDrawClip(previousClip);
}

/** The wrench sits on the repair circle and fades out once a second while the circle lasts. */
function drawRepairIcon(camera: CombatCamera, worldX: number, worldY: number, alpha: number): void {
    if (alpha <= 0) {
        return;
    }
    const screen = worldToScreen(camera, worldX, worldY);
    const previousClip = getDrawClip();
    setDrawClip({ x: camera.view.x, y: camera.view.y, width: camera.view.width, height: camera.view.height });
    const scale = camera.layout.cell / TILE_SIZE_PX;
    drawSprite({
        sprite: REPAIR_ICON,
        x: screen.x,
        y: screen.y,
        scaleX: scale,
        scaleY: scale,
        alpha,
        zIndex: 3,
        foreground: true,
    });
    setDrawClip(previousClip);
}

/** Draw a projectile if this camera can currently see it. */
function drawWorldProjectile(
    camera: CombatCamera,
    worldX: number,
    worldY: number,
    worldDx: number,
    worldDy: number,
    sprite: string,
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
    const scale = camera.layout.cell / TILE_SIZE_PX;
    const previousClip = getDrawClip();
    setDrawClip({ x: view.x, y: view.y, width: view.width, height: view.height });
    drawSprite({
        sprite,
        x: screen.x,
        y: screen.y,
        scaleX: scale,
        scaleY: scale,
        rotationRad: aimRotation(worldDx, worldDy, false),
        zIndex: 5,
    });
    setDrawClip(previousClip);
}

/** A spark is a white streak pointing the way it is flying. */
function drawSpark(camera: CombatCamera, spark: Spark): void {
    const screen = worldToScreen(camera, spark.x, spark.y);
    const view = camera.view;
    const margin = 24;
    if (
        screen.x < view.x - margin || screen.y < view.y - margin
        || screen.x > view.x + view.width + margin
        || screen.y > view.y + view.height + margin
    ) {
        return;
    }
    const length = camera.layout.cell * 0.7;
    const thickness = 2;
    const ahead = worldToScreen(camera, spark.x + spark.vx, spark.y + spark.vy);
    const alpha = Math.max(0, 1 - spark.age / spark.duration);
    const previousClip = getDrawClip();
    setDrawClip({ x: view.x, y: view.y, width: view.width, height: view.height });
    drawRect({
        x: screen.x - length / 2,
        y: screen.y - thickness / 2,
        width: length,
        height: thickness,
        color: `rgba(255, 255, 255, ${alpha})`,
        rotationRad: Math.atan2(ahead.y - screen.y, ahead.x - screen.x),
        zIndex: 4,
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

function isFirstCombat(eventIndex: number): boolean {
    if (getEventTypeForIndex(eventIndex) !== "COMBAT") {
        return false;
    }
    for (let index = 0; index < eventIndex; index++) {
        if (getEventTypeForIndex(index) === "COMBAT") {
            return false;
        }
    }
    return true;
}

/** Player and enemy share this update. Only the supplied input can start a shot. */
export function updateCombat(): void {
    setEngineBlend(0);
    const state = getGameState();
    if (!battle || encounterEvent !== state.gameDirector.eventIndex || combatAttempt !== directorAttempt()) {
        encounterEvent = state.gameDirector.eventIndex;
        combatAttempt = directorAttempt();
        const picked = pickEnemyVehicle(encounterEvent);
        moneyAwarded = false;
        battle = createBattle(state.playerData.vehicle, picked.vehicle, picked.moneyDropped);
        if (isFirstCombat(encounterEvent)) {
            startFirstCombatTutorial();
        }
        targetingRepair = false;
        playerViewShake = { magnitude: 0, x: 0, y: 0 };
        enemyViewShake = { magnitude: 0, x: 0, y: 0 };
        lastUpdateMs = performance.now();
    }
    const fight = battle;
    const player = fight.player;
    const enemy = fight.enemy;

    const fightOver = fight.result !== null;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - lastUpdateMs) / 1000));
    lastUpdateMs = now;

    const mouse = getMousePosition();
    const leftDown = isMouseButtonDown(0);
    const leftPressed = leftDown && !leftWasDown;
    leftWasDown = leftDown;

    const view = battleView(fight);
    const enemyView = view.enemyView;
    const playerView = view.playerView;
    const playerCamera = view.playerCamera;
    const enemyCamera = view.enemyCamera;
    applyShake(playerCamera, playerViewShake);
    applyShake(enemyCamera, enemyViewShake);
    const viewWidth = enemyView.width;

    const guns = gunsOf(player.instance);
    const livingGuns = guns.flatMap((gun, index) => gun.health > 0 ? [{ gun, index }] : []);
    const mouseOverEnemy = mouse.x >= enemyView.x && mouse.y >= enemyView.y
        && mouse.x < enemyView.x + enemyView.width
        && mouse.y < enemyView.y + enemyView.height;
    const mouseOverPlayer = mouse.x >= playerView.x && mouse.y >= playerView.y
        && mouse.x < playerView.x + playerView.width
        && mouse.y < playerView.y + playerView.height;
    const mouseWorld = enemyCamera && mouseOverEnemy ? screenToWorld(enemyCamera, mouse.x, mouse.y) : null;
    const playerWorld = playerCamera && mouseOverPlayer ? screenToWorld(playerCamera, mouse.x, mouse.y) : null;
    let chosenAbility: number | null = null;
    let selectRepair = false;
    let target: { x: number; y: number } | null = null;
    let repairAt: { x: number; y: number } | null = null;
    if (!fightOver && !dialogBlocksPlayer()) {
        for (let index = 0; index < WEAPON_KEY_COUNT; index++) {
            const down = isKeyDown(`Digit${index + 1}`) || isKeyDown(`Numpad${index + 1}`);
            const pressed = down && !weaponKeyWasDown[index];
            weaponKeyWasDown[index] = down;
            const weapon = livingGuns[index];
            if (pressed && weapon && combatGunSelectAllowed(index)) {
                chosenAbility = weapon.index;
            }
        }
        const repairDown = isKeyDown("KeyR");
        const repairPressed = repairDown && !repairKeyWasDown;
        repairKeyWasDown = repairDown;
        if (repairPressed && combatActionAllowed("repair")) {
            selectRepair = true;
        }
    } else {
        for (let index = 0; index < WEAPON_KEY_COUNT; index++) {
            weaponKeyWasDown[index] = isKeyDown(`Digit${index + 1}`) || isKeyDown(`Numpad${index + 1}`);
        }
        repairKeyWasDown = isKeyDown("KeyR");
    }
    if (chosenAbility !== null) {
        selectRepair = false;
    }
    if (!fightOver && leftPressed && !dialogBlocksPlayer()) {
        const hit = layoutAbilityButtons(livingGuns.length).find((button) => {
            return mouse.x >= button.x
                && mouse.y >= button.y
                && mouse.x < button.x + button.width
                && mouse.y < button.y + button.height;
        });
        const repairButton = repairButtonBounds(livingGuns.length);
        const hitRepair = mouse.x >= repairButton.x
            && mouse.y >= repairButton.y
            && mouse.x < repairButton.x + repairButton.width
            && mouse.y < repairButton.y + repairButton.height;
        if (hit) {
            if (combatGunSelectAllowed(hit.index)) {
                chosenAbility = livingGuns[hit.index].index;
                selectRepair = false;
            }
        } else if (hitRepair && combatActionAllowed("repair")) {
            selectRepair = true;
            chosenAbility = null;
        } else if (combatActionAllowed("repair") && (selectRepair || targetingRepair) && chosenAbility === null && playerWorld) {
            repairAt = playerWorld;
        } else if (combatActionAllowed("fire") && mouseWorld && !targetingRepair && !selectRepair) {
            target = mouseWorld;
        }
    }
    if (selectRepair) {
        targetingRepair = true;
        player.selectedAbility = -1;
    } else if (chosenAbility !== null) {
        targetingRepair = false;
    }

    const playerOrders: CombatantOrders | null = fightOver || dialogBlocksPlayer() ? null : {
        gun: chosenAbility,
        target: combatActionAllowed("fire") ? target : null,
        repair: combatActionAllowed("repair") ? repairAt : null,
    };
    const projectilesBefore = fight.projectiles.length;
    const cooldownBefore = player.guns.map((gun) => gun.cooldown);
    stepBattle(fight, dt, { player: playerOrders, enemy: null, enemyAi: !fightOver && !dialogBlocksEnemies() });
    const playerFired = fight.projectiles.length > projectilesBefore
        || player.guns.some((gun, index) => gun.cooldown > cooldownBefore[index]);
    if (playerFired) {
        notifyPlayerFired();
    }
    for (const name of fight.sounds.splice(0)) {
        playSound(name);
    }
    shakeFromExplosions(fight.explosions, dt, playerCamera, enemyCamera);
    applyShake(playerCamera, playerViewShake);
    applyShake(enemyCamera, enemyViewShake);
    const aimWorld = enemyCamera && mouseOverEnemy ? screenToWorld(enemyCamera, mouse.x, mouse.y) : null;
    const aimPlayerWorld = playerCamera && mouseOverPlayer ? screenToWorld(playerCamera, mouse.x, mouse.y) : null;
    if (fight.result === "victory" && !moneyAwarded) {
        state.playerData.money += fight.moneyDropped;
        moneyAwarded = true;
    }

    const turretRotations = turretAimRotations(player, playerCamera, aimWorld);
    const enemyRotations = turretAimRotations(enemy, enemyCamera, null);
    for (const shot of fight.projectiles) {
        const progress = shot.duration <= 0 ? 1 : Math.min(1, shot.age / shot.duration);
        const x = shot.fromX + (shot.toX - shot.fromX) * progress;
        const y = shot.fromY + (shot.toY - shot.fromY) * progress;
        const worldDx = shot.toX - shot.fromX;
        const worldDy = shot.toY - shot.fromY;
        if (playerCamera) {
            drawWorldProjectile(playerCamera, x, y, worldDx, worldDy, shot.projectileSprite);
        }
        if (enemyCamera) {
            drawWorldProjectile(enemyCamera, x, y, worldDx, worldDy, shot.projectileSprite);
        }
    }

    drawCombatVehicle(enemy.instance, enemyView, "Enemy", true, enemyRotations, enemyViewShake.x, enemyViewShake.y);
    drawCombatVehicle(player.instance, playerView, player.instance.base.name, false, turretRotations, playerViewShake.x, playerViewShake.y);
    if (!fightOver && !targetingRepair && aimWorld && enemyCamera) {
        const gun = guns[player.selectedAbility];
        const turret = gun?.tile.base.turret;
        if (gun && turret && gun.health > 0) {
            const stats = getOverclockedTurretStats(turret, gun.tile.overclocks);
            drawRangeCircle(
                enemyCamera,
                aimWorld.x,
                aimWorld.y,
                Math.max(0, stats.accuracy),
                ATTACK_RANGE_FILL,
                ATTACK_RANGE_STROKE,
            );
        }
    }
    if (!fightOver && targetingRepair && aimPlayerWorld && playerCamera) {
        drawRangeCircle(playerCamera, aimPlayerWorld.x, aimPlayerWorld.y, REPAIR_RADIUS, REPAIR_RANGE_FILL, REPAIR_RANGE_STROKE);
    }
    if (playerCamera) {
        for (const circle of fight.repairs) {
            drawRangeCircle(playerCamera, circle.x, circle.y, REPAIR_RADIUS, REPAIR_RANGE_FILL, REPAIR_RANGE_STROKE);
            drawRepairIcon(playerCamera, circle.x, circle.y, iconFlashAlpha(circle.age));
        }
    }
    drawRect({
        x: ABILITY_BAR_WIDTH,
        y: playerView.y - 1,
        width: viewWidth,
        height: 2,
        color: "#2e3546",
    });

    for (const explosion of fight.explosions) {
        const growth = explosion.age / EXPLOSION_DURATION;
        if (playerCamera) {
            drawExplosion(playerCamera, explosion, growth);
        }
        if (enemyCamera) {
            drawExplosion(enemyCamera, explosion, growth);
        }
    }
    for (const spark of fight.sparks) {
        if (playerCamera) {
            drawSpark(playerCamera, spark);
        }
        if (enemyCamera) {
            drawSpark(enemyCamera, spark);
        }
    }
    setDrawClip(null);

    const selectedAbility = player.selectedAbility;
    const gunStates = player.guns;
    const selectedLiving = livingGuns.findIndex((entry) => entry.index === selectedAbility);
    drawAbilityBar(
        livingGuns.map((entry) => entry.gun),
        targetingRepair ? -1 : selectedLiving,
        livingGuns.map((entry) => gunStates[entry.index].cooldown),
        { selected: targetingRepair, cooldown: player.repairCooldown },
    );
    const playerEnergy = energyBudget(player.instance);
    const enemyEnergy = energyBudget(enemy.instance);
    const playerHealth = healthRatio(player.instance);
    const enemyHealth = healthRatio(enemy.instance);
    drawViewEnergy(playerView, player.instance.power, playerEnergy.capacity, playerEnergy.generation);
    drawViewEnergy(enemyView, enemy.instance.power, enemyEnergy.capacity, enemyEnergy.generation);
    drawAbilityBarMoney(
        state.playerData.money,
        state.playerData.overclockModules,
        placedWeaponCount(state.playerData.vehicle),
        state.playerData.vehicleWeaponSlots,
        {
            healthRatio: playerHealth ?? 1,
            shakeX: playerViewShake.x,
            shakeY: playerViewShake.y,
        },
    );
    drawHealthBar(playerView.x + 24, playerView.y + 52, 240, playerHealth ?? 0);
    drawHealthBar(enemyView.x + 24, enemyView.y + 52, 240, enemyHealth ?? 0);

    if (fight.result === "defeat") {
        openGameOver();
        return;
    }
    if (!fight.result) {
        return;
    }

    const panel = resultPanelBounds(viewWidth);
    drawRect({
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height,
        color: "#1b1f2a",
        zIndex: 8,
    });
    drawText({
        text: "Victory",
        x: panel.x + panel.width / 2,
        y: panel.y + 58,
        font: "42px sans-serif",
        color: "#8ee0a8",
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
        zIndex: 8,
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
        transitionToNextEvent();
    }
}

function applyShake(camera: CombatCamera | null, shake: ViewShake): void {
    if (!camera) {
        return;
    }
    camera.shakeX = shake.x;
    camera.shakeY = shake.y;
}

function decayShake(shake: ViewShake, dt: number): void {
    shake.magnitude *= Math.exp(-SHAKE_DECAY * dt);
    if (shake.magnitude < 0.5) {
        shake.magnitude = 0;
        shake.x = 0;
        shake.y = 0;
    }
}

function kickShake(shake: ViewShake, explosionRadius: number): void {
    const amount = Math.max(0, explosionRadius) * SHAKE_PIXELS_PER_TILE;
    if (amount > shake.magnitude) {
        shake.magnitude = amount;
    }
}

/** A new blast shakes the tank view it landed on. The offset scales with the radius. */
function shakeFromExplosions(
    explosions: readonly Explosion[],
    dt: number,
    playerCamera: CombatCamera | null,
    enemyCamera: CombatCamera | null,
): void {
    decayShake(playerViewShake, dt);
    decayShake(enemyViewShake, dt);
    for (const explosion of explosions) {
        if (explosion.age > dt + 1e-4) {
            continue;
        }
        const playerDistance = cameraDistance(playerCamera, explosion);
        const enemyDistance = cameraDistance(enemyCamera, explosion);
        if (playerDistance <= enemyDistance) {
            kickShake(playerViewShake, explosion.radius);
        } else {
            kickShake(enemyViewShake, explosion.radius);
        }
    }
    if (playerViewShake.magnitude > 0) {
        sampleShake(playerViewShake);
    }
    if (enemyViewShake.magnitude > 0) {
        sampleShake(enemyViewShake);
    }
}

function cameraDistance(camera: CombatCamera | null, explosion: Explosion): number {
    if (!camera) {
        return Number.POSITIVE_INFINITY;
    }
    return Math.hypot(explosion.x - camera.worldX, explosion.y - camera.worldY);
}

function sampleShake(shake: ViewShake): void {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * shake.magnitude;
    shake.x = Math.cos(angle) * radius;
    shake.y = Math.sin(angle) * radius;
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
