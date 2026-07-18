import { Anim } from './animate.js';
import { getNearest, getRange, getRangeSquared } from '../utils/math.js';

export const Behavior = {
    TIMID: 'timid',
    HERBIVORE: 'herbivore',
    PREDATOR: 'predator',
    COMPETE: 'compete',
    BERSERK: 'berserk'
};

const WANDER = { anim: Anim.PARTICLE, vector: null };

// Решает, что существо делает в текущем тике: возвращает {anim, vector}.
// Побочные эффекты (поедание соседей) выполняются здесь же.
// nears — список соседей; передаётся снаружи, чтобы не искать их дважды за тик.
export function decide(lifer, world, nears = world.getNear(lifer)) {
    switch (lifer.behavior) {
        case Behavior.BERSERK:
            return berserk(lifer, world, nears);
        case Behavior.COMPETE:
            return compete(lifer, world, nears);
        case Behavior.HERBIVORE:
            return herbivore(lifer, world, nears);
        case Behavior.PREDATOR:
            return predator(lifer, world, nears);
        case Behavior.TIMID:
            return timid(lifer, nears);
        default:
            return WANDER;
    }
}

// Берсерк ест всех подряд.
function berserk(lifer, world, nears) {
    const target = getNearest(nears, lifer);
    if (!target) {
        return WANDER;
    }

    if (isReachable(lifer, target)) {
        world.remove(target);
        lifer.kills += 1;
        lifer.berserkCounter += 1;
    }

    return chase(target);
}

// Камень-ножницы-бумага: убегаем от danger, догоняем target.
// Все нужные цели ищем за один проход по соседям.
function compete(lifer, world, nears) {
    // остались два вида бойцов: исход решает размер, а не роли danger/target
    const endgame = world.competitorTypes === 2;

    let berserker = null;
    let berserkerRange = Infinity;
    let danger = null;
    let dangerRange = Infinity;
    let target = null;
    let targetRange = Infinity;

    for (const object of nears) {
        const range = getRangeSquared(lifer, object);

        if (object.behavior === Behavior.BERSERK && range < berserkerRange) {
            berserker = object;
            berserkerRange = range;
        }

        if (endgame) {
            // в эндшпиле цель — любой чужак, роль определится размером
            if (object.type !== lifer.type && range < targetRange) {
                target = object;
                targetRange = range;
            }
            continue;
        }

        if (object.type === lifer.danger && range < dangerRange) {
            danger = object;
            dangerRange = range;
        }
        if (object.type === lifer.target && range < targetRange) {
            target = object;
            targetRange = range;
        }
    }

    // берсерк опаснее всех — от него бежим в первую очередь
    if (berserker) {
        return escape(berserker);
    }

    if (endgame && target) {
        if (target.radius > lifer.radius) {
            danger = target;
        }
        if (target.radius === lifer.radius) {
            target = null;
        }
    }

    // съедаем цель и растём
    if (target && isReachable(lifer, target)) {
        world.remove(target);
        lifer.radius += 1;
        lifer.radiusView += 1;
        lifer.speed += 0.1;
        lifer.kills += 1;
        lifer.berserkCounter += 1;
    }

    if (danger) {
        return escape(danger);
    }
    return target ? chase(target) : WANDER;
}

// Корова: бежит от волка, иначе идёт есть траву.
function herbivore(lifer, world, nears) {
    const wolf = getNearest(nears, lifer, isWolf);
    const grass = getNearest(nears, lifer, isGrass);

    if (grass && isReachable(lifer, grass)) {
        world.remove(grass);
    }

    if (wolf) {
        return escape(wolf);
    }
    return grass ? chase(grass) : WANDER;
}

// Волк: догоняет и ест корову.
function predator(lifer, world, nears) {
    const cow = getNearest(nears, lifer, isCow);
    if (!cow) {
        return WANDER;
    }

    if (isReachable(lifer, cow)) {
        world.remove(cow);
    }

    return chase(cow);
}

// Призрак: убегает от любого соседа.
function timid(lifer, nears) {
    const nearest = getNearest(nears, lifer);
    return nearest ? escape(nearest) : WANDER;
}

const isWolf = (object) => object.type === 'Wolf';
const isGrass = (object) => object.type === 'Grass';
const isCow = (object) => object.type === 'Cow';

function isReachable(lifer, target) {
    return getRange(lifer, target) < lifer.radius;
}

function chase(target) {
    return { anim: Anim.CHASE, vector: { x: target.x, y: target.y } };
}

function escape(threat) {
    return { anim: Anim.ESCAPE, vector: { x: threat.x, y: threat.y } };
}
