import { Anim } from './animate.js';
import { getNearest, getRange, getRangeSquared } from '../utils/math.js';

// Поведение — постоянная роль вида: чем существо занято всю жизнь.
export const Behavior = {
    TIMID: 'timid',
    HERBIVORE: 'herbivore',
    PREDATOR: 'predator',
    COMPETE: 'compete',
    CARRY: 'carry'
};

// Состояние — временный режим поверх роли. Оно перебивает поведение
// в решении, но не стирает его: боец в берсерке остаётся бойцом,
// и матч по-прежнему считает его за свой вид.
export const State = {
    BERSERK: 'berserk'
};

const WANDER = { anim: Anim.PARTICLE, vector: null };

// Решает, что существо делает в текущем тике: возвращает {anim, vector}.
// Побочные эффекты (поедание соседей) выполняются здесь же.
// nears — список соседей; передаётся снаружи, чтобы не искать их дважды за тик.
export function decide(lifer, world, nears = world.getNear(lifer)) {
    const decider = DECIDERS[lifer.state ?? lifer.behavior];
    // поведения нет или оно незнакомое — существо просто дрейфует
    return decider ? decider(lifer, world, nears) : WANDER;
}

// Режим -> функция решения; ключами служат и поведения, и состояния.
// Все принимают (lifer, world, nears), даже если не всё им нужно:
// единая сигнатура — цена вызова по таблице.
const DECIDERS = {
    [State.BERSERK]: berserk,
    [Behavior.CARRY]: carry,
    [Behavior.COMPETE]: compete,
    [Behavior.HERBIVORE]: herbivore,
    [Behavior.PREDATOR]: predator,
    [Behavior.TIMID]: timid
};

// Берсерк ест всех подряд.
function berserk(lifer, world, nears) {
    const target = getNearest(nears, lifer);
    if (!target) {
        return WANDER;
    }

    if (isReachable(lifer, target)) {
        lifer.eat(world, target);
    }

    return chase(target);
}

// Носильщик ходит по кругу: с пустыми руками — к источнику, с грузом —
// к месту сдачи. Куда именно, задаёт вид: target — откуда берём,
// dropAt — куда несём.
//
// Ищем по всему миру, а не среди соседей: постройки стоят где поставили,
// и радиуса обзора до них обычно не хватает. Зато решение принимается раз
// в несколько тиков, так что перебор идёт не каждый тик.
function carry(lifer, world, nears) {
    const loaded = lifer.load > 0;
    const place = world.nearestOf(lifer, loaded ? lifer.dropAt : lifer.target, !loaded);

    if (!place) {
        return WANDER;
    }

    // дошли до места — отдаём или берём груз
    if (getRange(lifer, place) < place.radius) {
        if (loaded) {
            place.receive();
            lifer.load = 0;
            // доставка возвращает силы: иначе носильщик, которому некогда
            // отдыхать, через полминуты навсегда переходил бы на полшага
            lifer.gainEnergy(lifer.energyMax);
        } else if (place.give(world)) {
            lifer.load = 1;
        }
    }

    return chase(place);
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

        if (object.state === State.BERSERK && range < berserkerRange) {
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
        lifer.eat(world, target);
        lifer.radius += 1;
        lifer.radiusView += 1;
        lifer.speed += 0.1;
    }

    if (danger) {
        return escape(danger);
    }
    return target ? chase(target) : WANDER;
}

// Травоядное: бежит от своей угрозы, иначе идёт есть свою цель.
function herbivore(lifer, world, nears) {
    const threat = nearestOfType(lifer, nears, lifer.danger);
    const food = nearestOfType(lifer, nears, lifer.target);

    if (food && isReachable(lifer, food)) {
        lifer.eat(world, food);
    }

    if (threat) {
        return escape(threat);
    }
    return food ? chase(food) : WANDER;
}

// Хищник: догоняет и ест свою цель.
function predator(lifer, world, nears) {
    const prey = nearestOfType(lifer, nears, lifer.target);
    if (!prey) {
        return WANDER;
    }

    if (isReachable(lifer, prey)) {
        lifer.eat(world, prey);
    }

    return chase(prey);
}

// Призрак: убегает от любого соседа. world не нужен — соседи уже переданы.
function timid(lifer, world, nears) {
    const nearest = getNearest(nears, lifer);
    return nearest ? escape(nearest) : WANDER;
}

// Ближайший сосед заданного вида. Отдельная функция вместо предиката-замыкания:
// decide() зовётся для каждого существа в каждом тике, и замыкание там —
// лишняя аллокация на ровном месте.
function nearestOfType(lifer, nears, type) {
    if (!type) {
        return null;
    }

    let nearest = null;
    let nearestRange = Infinity;

    for (const object of nears) {
        if (object.type !== type) {
            continue;
        }

        const range = getRangeSquared(lifer, object);
        if (range < nearestRange) {
            nearest = object;
            nearestRange = range;
        }
    }

    return nearest;
}

function isReachable(lifer, target) {
    return getRange(lifer, target) < lifer.radius;
}

function chase(target) {
    return { anim: Anim.CHASE, vector: { x: target.x, y: target.y } };
}

function escape(threat) {
    return { anim: Anim.ESCAPE, vector: { x: threat.x, y: threat.y } };
}
