import { animate } from './animate.js';
import { Behavior, decide } from './behavior.js';
import { drawCircle } from '../render/draw.js';

const SECOND = 60; // тиков в секунде при 60 fps
const MINUTE = SECOND * 60;

// Базовое существо: неподвижное, просто стареет.
export class Base {
    constructor(x, y) {
        this.id = null;
        this.removed = false;
        this.type = 'Base';
        this.x = x;
        this.y = y;
        this.dx = 0;
        this.dy = 0;

        this.radius = 8;
        this.radiusView = 0;
        this.ttl = MINUTE * 10;
        this.energy = 100;
        this.color = 'black';
        this.behavior = null;
    }

    draw(context) {
        drawCircle(context, this, this.color);
    }

    update(world) {
        this.age(world);
    }

    // Одна единица времени жизни; на нуле существо исчезает.
    age(world) {
        if (!--this.ttl) {
            world.remove(this);
        }
    }

    // Кадр истории собирает World.captureFrame() — существу достаточно
    // сообщить, включён ли режим берсерка (цвет в записи не хранится).
    isBerserk() {
        return this.behavior === Behavior.BERSERK;
    }
}

// Существо, которое двигается по своему поведению.
export class Creature extends Base {
    constructor(x, y) {
        super(x, y);
        this.radiusView = 100;
        this.speed = 1;
    }

    update(world) {
        // соседей ищем один раз за тик и переиспользуем в решении и в движении
        const nears = world.getNear(this);
        const { anim, vector } = decide(this, world, nears);
        animate(this, world, anim, vector, nears);
        this.age(world);
    }
}

export class Grass extends Base {
    constructor(x, y) {
        super(x, y);
        this.type = 'Grass';
        this.color = 'green';
    }
}

export class Ghost extends Creature {
    constructor(x, y) {
        super(x, y);
        this.type = 'Ghost';
        this.behavior = Behavior.TIMID;
        this.radius = 10;
        this.speed = 0.5;
        this.color = 'purple';
    }
}

export class Cow extends Creature {
    constructor(x, y) {
        super(x, y);
        this.type = 'Cow';
        this.behavior = Behavior.HERBIVORE;
        this.radius = 10;
        this.ttl = MINUTE * 2;
        this.color = 'peru';
    }
}

export class Wolf extends Creature {
    constructor(x, y) {
        super(x, y);
        this.type = 'Wolf';
        this.behavior = Behavior.PREDATOR;
        this.ttl = MINUTE;
        this.speed = 1.2;
        this.color = 'gray';
    }
}

// Боец «камень-ножницы-бумага»: ест target, убегает от danger.
export class Unit extends Creature {
    constructor(x, y) {
        super(x, y);
        this.type = 'Unit';
        this.behavior = Behavior.COMPETE;
        this.radius = 10;

        this.danger = null;
        this.target = null;

        this.kills = 0;
        this.berserkCounter = 0;
        this.berserkTtl = 0;
    }

    update(world) {
        super.update(world);
        this.updateBerserk(world);
    }

    updateBerserk(world) {
        // более 4 убийств за 20 секунд — входим в режим берсерка на 5 секунд
        if (this.berserkCounter > 4 && this.berserkTtl === 0) {
            this.color = 'black';
            this.berserkTtl = SECOND * 5;
            this.speed *= 1.5;
            this.behavior = Behavior.BERSERK;
        }

        // каждые 4 секунды счётчик убийств остывает
        if (world.tick % (SECOND * 4) === 0 && this.berserkCounter > 0) {
            this.berserkCounter--;
        }

        // выход из режима берсерка — смерть
        if (this.berserkTtl > 0) {
            this.berserkTtl--;
            if (this.berserkTtl === 0) {
                world.remove(this);
            }
        }
    }
}

export class Stone extends Unit {
    constructor(x, y) {
        super(x, y);
        this.type = 'Stone';
        this.color = 'orange';
        this.danger = 'Paper';
        this.target = 'Clip';
    }
}

export class Clip extends Unit {
    constructor(x, y) {
        super(x, y);
        this.type = 'Clip';
        this.color = 'red';
        this.danger = 'Stone';
        this.target = 'Paper';
    }
}

export class Paper extends Unit {
    constructor(x, y) {
        super(x, y);
        this.type = 'Paper';
        this.color = 'blue';
        this.danger = 'Clip';
        this.target = 'Stone';
    }
}

// Реестр доступных моделей: тип -> класс.
export const LIFERS = { Grass, Ghost, Cow, Wolf, Stone, Clip, Paper };

const TYPES = Object.keys(LIFERS);
const TYPE_INDEX = new Map(TYPES.map((type, index) => [type, index]));

export function liferTypes() {
    return TYPES.slice();
}

// В истории тип хранится числом — это позволяет держать кадр
// в типизированном массиве вместо тысяч строк.
export function typeIndex(type) {
    return TYPE_INDEX.get(type) ?? 0;
}

export function typeByIndex(index) {
    return TYPES[index];
}

export function createLifer(type, x, y) {
    const Model = LIFERS[type];
    if (!Model) {
        throw new Error('Unknown lifer: ' + type);
    }
    return new Model(x, y);
}

const COLORS = {};

// Цвет типа — берётся один раз и запоминается: нужен палитре, графику
// и отрисовке истории, каждый раз создавать существо ради цвета незачем.
export function liferColor(type) {
    if (!(type in COLORS)) {
        COLORS[type] = createLifer(type, 0, 0).color;
    }
    return COLORS[type];
}
