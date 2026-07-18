import { Anim, animate } from './animate.js';
import { Behavior, State, decide } from './behavior.js';
import { drawCircle } from '../render/draw.js';

const SECOND = 60; // тиков в секунде при 60 fps
const MINUTE = SECOND * 60;

// Работой считается только осмысленное движение — погоня и бегство.
// Дрейф существо тратит на то, чтобы перевести дух.
const EFFORT = new Set([Anim.CHASE, Anim.ESCAPE]);

// Цена тика работы растёт с массой и скоростью: крупному и быстрому
// каждое движение обходится дороже. Отсюда же берётся плата за берсерка —
// полуторная скорость выжигает запас в полтора раза быстрее.
//
// Величина подобрана по сценариям: при ней запас садится за долгую погоню,
// но обычная жизнь его не проедает. Дороже — и травоядные не успевают
// пастись, популяции сползают вдвое; дешевле — энергия перестаёт значить.
const EFFORT_RATE = 0.03;

// Сколько сил возвращает тик покоя.
const REST_GAIN = 1;

// Обессиленное существо не замирает — оно волочится вполсилы.
// Множитель, а не вычитание: когда выдыхаются обе стороны погони,
// их соотношение сохраняется и охота не превращается в бойню.
const EXHAUSTED_PACE = 0.5;

// Добыча возвращает силы соразмерно своему размеру.
const FOOD_VALUE = 20;

// Признаки состояния в кадре истории. Кадр хранит их отдельным байтом,
// а не старшим битом типа: вид и состояние — разные вещи, и упаковка
// их в одно число упирала бы модель в 127 видов.
export const Flag = { BERSERK: 1 };

export const BERSERK_COLOR = 'black';

// Описание вида — значения, одинаковые у всех особей: кто мы, как выглядим,
// кого едим. Живут на прототипе, а не в экземпляре: иначе тысяча камней
// хранит тысячу копий строки 'orange'.
//
// Изменяемым величинам (radius, speed, ttl, color) это не мешает: запись
// в объект заводит собственное поле поверх прототипного, и описание вида
// остаётся нетронутым. Заодно видно, где кончается вид и начинается особь.
const SPECIES_FIELDS = new Map();

function defineSpecies(Model, spec) {
    Object.assign(Model.prototype, spec);
    SPECIES_FIELDS.set(Model, Object.keys(spec));
}

// Базовое существо: неподвижное, просто стареет.
export class Base {
    constructor(x, y) {
        this.id = null;
        this.removed = false;
        this.x = x;
        this.y = y;
        this.dx = 0;
        this.dy = 0;

        // Временное состояние поверх поведения вида; null — обычная жизнь.
        // Поведение при этом не затирается: по нему существо остаётся
        // травоядным или бойцом, чем бы оно ни было занято сейчас.
        this.state = null;
    }

    draw(context) {
        drawCircle(context, this, this.color);
    }

    update(world) {
        this.age(world);
    }

    // Одна единица времени жизни; на нуле существо исчезает.
    age(world) {
        if (--this.ttl <= 0) {
            world.remove(this);
        }
    }

    // Съесть соседа. Само поедание одинаково для всех, а счётчики заводят
    // те, кому они нужны — поведению незачем знать про поля конкретных видов.
    eat(world, victim) {
        world.remove(victim);
    }

    // Признаки состояния для кадра истории: у обычного существа их нет.
    frameFlags() {
        return 0;
    }
}

defineSpecies(Base, {
    type: 'Base',
    behavior: null,
    radius: 8,
    radiusView: 0,
    ttl: MINUTE * 10,
    color: 'black'
});

// Существо, которое двигается по своему поведению. За движение оно платит
// силами: догонять и убегать дорого, дрейфовать — бесплатно, а еда
// возвращает потраченное. Запас конечен, поэтому спринт конечен тоже.
export class Creature extends Base {
    constructor(x, y) {
        super(x, y);
        // запас сил; вид задаёт и стартовое значение, и потолок
        this.energy = this.energyMax;
    }

    update(world) {
        // соседей ищем один раз за тик и переиспользуем в решении и в движении
        const nears = world.getNear(this);
        const { anim, vector } = decide(this, world, nears);
        // платим за движение, которое действительно случилось, а не за
        // задуманное: расталкивание соседей могло подменить решение
        this.spend(animate(this, world, anim, vector, nears));
        this.age(world);
    }

    // Скорость с оглядкой на силы: вид задаёт предел, энергия — доступное.
    get pace() {
        return this.energy > 0 ? this.speed : this.speed * EXHAUSTED_PACE;
    }

    // Расход и восстановление за один тик.
    spend(anim) {
        const change = EFFORT.has(anim)
            ? -this.speed * this.radius * EFFORT_RATE
            : REST_GAIN;

        this.gainEnergy(change);
    }

    eat(world, victim) {
        super.eat(world, victim);
        this.gainEnergy(victim.radius * FOOD_VALUE);
    }

    // Запас не уходит в минус и не копится выше предела вида: иначе
    // объевшийся волк неделю бегал бы на прошлогодней корове.
    gainEnergy(amount) {
        this.energy = Math.max(0, Math.min(this.energyMax, this.energy + amount));
    }
}

defineSpecies(Creature, {
    radiusView: 100,
    speed: 1,
    energyMax: 300,

    // виды-ориентиры поведения: кого едим и от кого убегаем
    danger: null,
    target: null
});

export class Grass extends Base {}

defineSpecies(Grass, {
    type: 'Grass',
    color: 'green'
});

export class Ghost extends Creature {}

defineSpecies(Ghost, {
    type: 'Ghost',
    behavior: Behavior.TIMID,
    radius: 10,
    speed: 0.5,
    color: 'purple'
});

export class Cow extends Creature {}

defineSpecies(Cow, {
    type: 'Cow',
    behavior: Behavior.HERBIVORE,
    radius: 10,
    ttl: MINUTE * 2,
    color: 'peru',
    danger: 'Wolf',
    target: 'Grass'
});

export class Wolf extends Creature {}

defineSpecies(Wolf, {
    type: 'Wolf',
    behavior: Behavior.PREDATOR,
    ttl: MINUTE,
    speed: 1.2,
    color: 'gray',
    target: 'Cow'
});

// Ловец призраков: быстрее добычи лишь на пять сотых, поэтому берёт её
// в основном у границы мира, где призраку некуда деться.
export class Human extends Creature {}

defineSpecies(Human, {
    type: 'Human',
    behavior: Behavior.PREDATOR,
    radius: 10,
    ttl: MINUTE * 3,
    speed: 0.55,
    color: 'teal',
    target: 'Ghost'
});

// Боец «камень-ножницы-бумага»: ест target, убегает от danger.
export class Unit extends Creature {
    constructor(x, y) {
        super(x, y);
        this.kills = 0;
        this.berserkCounter = 0;
        this.berserkTtl = 0;
    }

    update(world) {
        super.update(world);
        this.updateBerserk(world);
    }

    // Любое убийство приближает берсерка — и в обычном режиме, и в нём самом.
    eat(world, victim) {
        super.eat(world, victim);
        this.kills += 1;
        this.berserkCounter += 1;
    }

    updateBerserk(world) {
        // более 4 убийств за 20 секунд — входим в режим берсерка на 5 секунд
        if (this.berserkCounter > 4 && this.berserkTtl === 0) {
            this.color = BERSERK_COLOR;
            this.berserkTtl = SECOND * 5;
            this.speed *= 1.5;
            this.state = State.BERSERK;
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

    frameFlags() {
        return this.state === State.BERSERK ? Flag.BERSERK : 0;
    }
}

defineSpecies(Unit, {
    behavior: Behavior.COMPETE,
    radius: 10
});

export class Stone extends Unit {}

defineSpecies(Stone, {
    type: 'Stone',
    color: 'orange',
    danger: 'Paper',
    target: 'Clip'
});

export class Clip extends Unit {}

defineSpecies(Clip, {
    type: 'Clip',
    color: 'red',
    danger: 'Stone',
    target: 'Paper'
});

export class Paper extends Unit {}

defineSpecies(Paper, {
    type: 'Paper',
    color: 'blue',
    danger: 'Clip',
    target: 'Stone'
});

// Реестр доступных моделей: тип -> класс.
export const LIFERS = { Grass, Ghost, Human, Cow, Wolf, Stone, Clip, Paper };

// Связи видов заданы именами, и опечатка в danger или target не сломала бы
// ничего заметно — цель просто никогда бы не находилась. Сверяем имена
// с реестром один раз при загрузке модуля.
for (const [name, Model] of Object.entries(LIFERS)) {
    for (const field of ['danger', 'target']) {
        const type = Model.prototype[field];
        if (type && !(type in LIFERS)) {
            throw new Error(`${name}.${field}: неизвестный вид ${type}`);
        }
    }
}

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

function liferModel(type) {
    const Model = LIFERS[type];
    if (!Model) {
        throw new Error('Unknown lifer: ' + type);
    }
    return Model;
}

export function createLifer(type, x, y) {
    return new (liferModel(type))(x, y);
}

// Цвет вида нужен палитре, графику и отрисовке истории. Он лежит на прототипе,
// поэтому берётся напрямую — создавать существо ради цвета больше не нужно.
export function liferColor(type) {
    return liferModel(type).prototype.color;
}

// Радиус обзора вида. Нужен, чтобы пометить существо в кадре истории, когда
// живого объекта уже нет: в кадре радиуса обзора не хранится.
export function liferViewRadius(type) {
    return liferModel(type).prototype.radiusView;
}

// Поля существа, разложенные по классам иерархии: [{name, fields}]
// от базового класса к самому конкретному.
//
// Источников два, и оба известны точно: значения вида, объявленные через
// defineSpecies, и поля экземпляра, заведённые конструктором класса.
// Угадывать владельца по совпадению значений с родительским образцом
// больше не нужно — вид объявлен явно.
//
// Поле, объявленное дважды (Base задаёт color, Stone его переопределяет),
// достаётся самому конкретному из объявивших: именно он делает вид собой.
const FIELD_GROUPS = new Map();

export function liferFieldGroups(lifer) {
    const Model = lifer.constructor;

    if (!FIELD_GROUPS.has(Model)) {
        FIELD_GROUPS.set(Model, buildFieldGroups(Model));
    }
    return FIELD_GROUPS.get(Model);
}

function buildFieldGroups(Model) {
    const chain = classChain(Model);
    // конструкторы всех моделей принимают (x, y); образец нужен, чтобы
    // увидеть поля экземпляра — на прототипе их нет
    const probes = chain.map((Class) => new Class(0, 0));
    const owners = new Map();

    chain.forEach((Class, index) => {
        for (const field of SPECIES_FIELDS.get(Class) ?? []) {
            owners.set(field, index);
        }

        // конструктор дописывает собственные поля поверх родительских:
        // новым считается ключ, которого у образца родителя ещё не было
        const parent = probes[index - 1];
        for (const field of Object.keys(probes[index])) {
            if (!parent || !(field in parent)) {
                owners.set(field, index);
            }
        }
    });

    const groups = chain.map((Class) => ({ name: Class.name, fields: [] }));
    for (const [field, index] of owners) {
        groups[index].fields.push(field);
    }

    return groups;
}

// Цепочка наследования от базового класса к переданному.
// Останавливаемся на Function.prototype — у него нет своего prototype.
function classChain(Model) {
    const chain = [];

    for (let Class = Model; Class && Class.prototype; Class = Object.getPrototypeOf(Class)) {
        chain.unshift(Class);
    }

    return chain;
}
