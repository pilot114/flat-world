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

// Сколько единиц сырья уходит на один товар.
const PARTS = 3;

// Пустой список соседей для тиков, в которые существо не принимает решений.
const NOBODY = [];

// Как далеко от родителя появляется потомок — в его же радиусах.
// Вплотную его тут же оттолкнуло бы расталкивание соседей.
const BREED_AWAY = 2;

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
    }

    // part — доля пути до следующего тика: на медленной скорости кадров
    // отрисовки больше, чем тиков, и без этого движение выглядело бы рваным.
    draw(context, part) {
        drawCircle(context, this, this.color, part);
    }

    // Неподвижное существо за тик не делает ничего: оно просто есть, пока
    // его не съедят. Возраст появляется у Creature — вместе с движением,
    // за которое надо платить. Трава от старости не гибнет ни в одном
    // сценарии: её всегда съедают раньше.
    update() {}

    // Съесть соседа. Само поедание одинаково для всех, а счётчики заводят
    // те, кому они нужны — поведению незачем знать про поля конкретных видов.
    eat(world, victim) {
        world.remove(victim);
    }

    // Отдать носильщику единицу груза. Ресурс на этом кончается —
    // у постройки вместо этого убывает запас.
    give(world) {
        world.remove(this);
        return true;
    }

    // Есть ли что отдавать. Ресурс лежит целиком, поэтому да.
    canGive() {
        return true;
    }

    // Признаки состояния для кадра истории: у обычного существа их нет.
    frameFlags() {
        return 0;
    }
}

defineSpecies(Base, {
    radius: 8,
    color: 'black'
});

// Существо, которое двигается по своему поведению. За движение оно платит
// силами: догонять и убегать дорого, дрейфовать — бесплатно, а еда
// возвращает потраченное. Запас конечен, поэтому спринт конечен тоже.
export class Creature extends Base {
    constructor(x, y) {
        super(x, y);
        // импульс: на сколько существо сдвинется в этом тике
        this.dx = 0;
        this.dy = 0;
        // запас сил; вид задаёт и стартовое значение, и потолок
        this.energy = this.energyMax;
        // съедено с последнего потомка
        this.fed = 0;
    }

    update(world) {
        if (this.thinks(world)) {
            // соседей ищем один раз за тик и переиспользуем в решении и в движении
            const nears = world.getNear(this);
            const { anim, vector } = decide(this, world, nears);
            // платим за движение, которое действительно случилось, а не за
            // задуманное: расталкивание соседей могло подменить решение,
            // — и сразу за весь промежуток до следующего решения
            this.spend(animate(this, world, anim, vector, nears), this.reaction);
        } else {
            // между решениями существо летит по прежнему импульсу —
            // в том числе по нулевому, если решило ждать
            animate(this, world, Anim.COAST, null, NOBODY);
        }

        this.breed(world);
        this.age(world);
    }

    // Одна единица времени жизни; на нуле существо исчезает.
    age(world) {
        if (--this.ttl <= 0) {
            world.remove(this);
        }
    }

    // Пора ли пересматривать решение.
    //
    // Каждый тик его пересматривать нельзя: оказавшись между двумя почти
    // равными раздражителями — двумя травинками или двумя волками, — существо
    // переключается между ними шестьдесят раз в секунду и дрожит на месте.
    //
    // Момент решения разнесён по id: если бы весь мир думал в один тик,
    // картинка пульсировала бы целиком, а нагрузка собиралась в пики.
    thinks(world) {
        return (world.tick + this.id) % this.reaction === 0;
    }

    // Сытое существо приносит потомка.
    //
    // Считаем съеденное, а не запас сил: запас растёт и на отдыхе, и тогда
    // размножаться можно было бы, просто стоя на месте. Съеденное же берётся
    // только у того, кого удалось поймать, — популяция упирается в еду,
    // ради чего сценарий с размножением и нужен.
    //
    // Запас при этом делится пополам: потомок обходится родителю ровно
    // в то, что достаётся ему самому.
    breed(world) {
        if (!world.breeding || !this.breedAfter || this.fed < this.breedAfter) {
            return;
        }

        this.fed = 0;
        this.energy /= 2;

        const angle = world.random.int(0, 359) * (Math.PI / 180);
        const away = this.radius * BREED_AWAY;
        const child = new this.constructor(
            clamp(this.x + Math.cos(angle) * away, 1, world.width - 1),
            clamp(this.y + Math.sin(angle) * away, 1, world.height - 1)
        );

        child.energy = this.energy;
        world.add(child);
    }

    // Скорость с оглядкой на силы: вид задаёт предел, энергия — доступное.
    get pace() {
        return this.energy > 0 ? this.speed : this.speed * EXHAUSTED_PACE;
    }

    // Расход и восстановление. ticks — за сколько тиков сразу: между
    // решениями существо ничего не решает, и платить там не за что,
    // поэтому весь промежуток оплачивается в момент решения.
    spend(anim, ticks = 1) {
        const change = EFFORT.has(anim)
            ? -this.speed * this.radius * EFFORT_RATE * ticks
            : REST_GAIN * ticks;

        this.gainEnergy(change);
    }

    eat(world, victim) {
        super.eat(world, victim);
        this.gainEnergy(victim.radius * FOOD_VALUE);
        this.fed += 1;
    }

    // Запас не уходит в минус и не копится выше предела вида: иначе
    // объевшийся волк неделю бегал бы на прошлогодней корове.
    gainEnergy(amount) {
        this.energy = Math.max(0, Math.min(this.energyMax, this.energy + amount));
    }
}

defineSpecies(Creature, {
    behavior: null,
    radiusView: 100,
    speed: 1,
    ttl: MINUTE * 10,
    energyMax: 300,
    // раз во сколько тиков существо пересматривает решение
    reaction: 4,
    // сколько добычи нужно на одного потомка; ноль — вид не размножается
    breedAfter: 0,

    // виды-ориентиры поведения: кого едим и от кого убегаем
    danger: null,
    target: null
});

export class Grass extends Base {}

defineSpecies(Grass, {
    color: 'green'
});

export class Ghost extends Creature {}

defineSpecies(Ghost, {
    behavior: Behavior.TIMID,
    radius: 10,
    speed: 0.5,
    color: 'purple'
});

export class Cow extends Creature {}

defineSpecies(Cow, {
    behavior: Behavior.HERBIVORE,
    radius: 10,
    ttl: MINUTE * 2,
    color: 'peru',
    danger: 'Wolf',
    target: 'Grass',
    // пять травинок на телёнка; подобрано замером — при меньшем стадо
    // взлетает и выедает луг, при большем не поспевает за волками
    breedAfter: 5
});

export class Wolf extends Creature {}

defineSpecies(Wolf, {
    behavior: Behavior.PREDATOR,
    ttl: MINUTE,
    speed: 1.2,
    color: 'gray',
    target: 'Cow',
    // Восемь коров на волчонка. Шесть тоже давали живую цепочку, но она
    // держалась на грани: из восьми seed один срывался в обвал — коровы
    // вымирали, следом волки, и луг зарастал. Волк размножается медленнее
    // жертвы, иначе он её попросту доедает.
    breedAfter: 8
});

// Ловец призраков: быстрее добычи лишь на пять сотых, поэтому берёт её
// в основном у границы мира, где призраку некуда деться.
export class Human extends Creature {}

defineSpecies(Human, {
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

        // Временный режим поверх поведения вида; null — обычная жизнь.
        // Живёт у бойца, а не у всех: берсерк бывает только здесь.
        // Поведение при этом не затирается: по нему боец остаётся бойцом,
        // чем бы он ни был занят сейчас.
        this.state = null;
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
    color: 'orange',
    danger: 'Paper',
    target: 'Clip'
});

export class Clip extends Unit {}

defineSpecies(Clip, {
    color: 'red',
    danger: 'Stone',
    target: 'Paper'
});

export class Paper extends Unit {}

defineSpecies(Paper, {
    color: 'blue',
    danger: 'Clip',
    target: 'Stone'
});

// --- Хозяйство: ресурсы, постройки и носильщики между ними ---

// Постройка: не двигается, копит запас и отдаёт его носильщикам.
// stock — что здесь лежит: складу это сырьё на вывоз, рынку — проданное.
// Завод добавляет к этому goods, готовый товар.
export class Place extends Base {
    constructor(x, y) {
        super(x, y);
        this.stock = 0;
    }

    receive() {
        this.stock += 1;
    }

    give() {
        if (this.stock <= 0) {
            return false;
        }
        this.stock -= 1;
        return true;
    }

    canGive() {
        return this.stock > 0;
    }
}

defineSpecies(Place, {
    radius: 16,
    color: 'tan'
});

export class Tree extends Base {}

defineSpecies(Tree, { color: 'darkgreen', radius: 7 });

export class Ore extends Base {}

defineSpecies(Ore, { color: 'dimgray', radius: 7 });

// Склад принимает сырьё и отдаёт его дальше — тем же запасом.
export class Store extends Place {}

defineSpecies(Store, { color: 'saddlebrown' });

// Завод копит сырьё и переводит его в товар: PARTS единиц на один товар.
export class Plant extends Place {
    constructor(x, y) {
        super(x, y);
        // готовый товар: у склада и рынка его нет, отдавать им нечего кроме
        // того, что приняли
        this.goods = 0;
    }

    update() {
        if (this.stock >= PARTS) {
            this.stock -= PARTS;
            this.goods += 1;
        }
    }

    give() {
        if (this.goods <= 0) {
            return false;
        }
        this.goods -= 1;
        return true;
    }

    canGive() {
        return this.goods > 0;
    }
}

defineSpecies(Plant, { color: 'steelblue', radius: 18 });

// Рынок только принимает: проданный товар обратно не забирают,
// и накопленное лежит в том же stock.
export class Market extends Place {
    canGive() {
        return false;
    }
}

defineSpecies(Market, { color: 'goldenrod', radius: 18 });

// Носильщик: пустой идёт к target, гружёный — к dropAt.
export class Carrier extends Creature {
    constructor(x, y) {
        super(x, y);
        // 0 или 1: носят по одной единице, чтобы ходьба была видна
        this.load = 0;
    }
}

defineSpecies(Carrier, {
    behavior: Behavior.CARRY,
    // хозяйство живёт дольше луга: работники должны пережить цепочку,
    // а не вымереть на полпути
    ttl: MINUTE * 15,
    // куда сдавать груз; откуда брать — в target
    dropAt: null
});

export class Logger extends Carrier {}

defineSpecies(Logger, { color: 'olive', target: 'Tree', dropAt: 'Store' });

export class Miner extends Carrier {}

defineSpecies(Miner, { color: 'slategray', target: 'Ore', dropAt: 'Store' });

export class Carter extends Carrier {}

defineSpecies(Carter, { color: 'chocolate', speed: 1.3, target: 'Store', dropAt: 'Plant' });

export class Trader extends Carrier {}

defineSpecies(Trader, { color: 'darkviolet', speed: 1.5, target: 'Plant', dropAt: 'Market' });

// Реестр доступных моделей: тип -> класс.
export const LIFERS = {
    Grass, Ghost, Human, Cow, Wolf, Stone, Clip, Paper,
    Tree, Ore, Store, Plant, Market, Logger, Miner, Carter, Trader
};

// Срок жизни хранится в слепке истории двумя байтами, и вид, переживший этот
// предел, восстанавливался бы с обрезанным ttl — молча и не сразу заметно.
// Ровно это и случилось, когда работникам хозяйства выдали полчаса жизни.
const TTL_LIMIT = 65535;

// Связи видов заданы именами, и опечатка в danger, target или dropAt
// не сломала бы ничего заметно — цель просто никогда бы не находилась.
// Сверяем имена с реестром один раз при загрузке модуля.
for (const [name, Model] of Object.entries(LIFERS)) {
    for (const field of ['danger', 'target', 'dropAt']) {
        const type = Model.prototype[field];
        if (type && !(type in LIFERS)) {
            throw new Error(`${name}.${field}: неизвестный вид ${type}`);
        }
    }

    if (Model.prototype.ttl > TTL_LIMIT) {
        throw new Error(`${name}.ttl: ${Model.prototype.ttl} не влезает в слепок истории`);
    }
}

// Связи видов объявлены именами, а хранятся классами: сравнивать ссылку
// в горячем цикле проще, чем строку, и опечатка отсеивается проверкой выше.
// Имена при этом остаются в описании вида — читать их так понятнее.
for (const Model of Object.values(LIFERS)) {
    for (const field of ['danger', 'target', 'dropAt']) {
        const wanted = Model.prototype[field];
        if (typeof wanted === 'string') {
            Model.prototype[field] = LIFERS[wanted];
        }
    }
}

// Существо опознаётся по своему классу — поля с именем вида у него нет.
// Имя нужно только там, где на него смотрят снаружи: сценариям, панелям
// и реестру, — и берётся оно из ключа реестра, а не из Model.name: ключ
// переживает минификацию, имя класса нет.
const TYPES = Object.keys(LIFERS);
const TYPE_INDEX = new Map(Object.values(LIFERS).map((Model, index) => [Model, index]));
const NAME_INDEX = new Map(TYPES.map((name, index) => [name, index]));

export function liferTypes() {
    return TYPES.slice();
}

// Каталог видов, разложенный по их месту в иерархии. Нужен песочнице:
// семнадцать видов подряд выбирать неудобно, а группы у них уже есть —
// это те самые классы, от которых они наследуются.
//
// Порядок от частного к общему: вид попадает в первую группу, которой
// он принадлежит, иначе боец оказался бы просто «животным».
const KINDS = [
    { name: 'носильщики', Model: () => Carrier },
    { name: 'постройки', Model: () => Place },
    { name: 'бойцы', Model: () => Unit },
    { name: 'животные', Model: () => Creature },
    { name: 'неподвижные', Model: () => Base }
];

export function liferKinds() {
    const kinds = KINDS.map(({ name }) => ({ name, types: [] }));

    for (const type of TYPES) {
        const index = KINDS.findIndex(({ Model }) => LIFERS[type].prototype instanceof Model());
        kinds[index].types.push(type);
    }

    return kinds.filter((kind) => kind.types.length > 0);
}

// В истории вид хранится числом — это позволяет держать кадр
// в типизированном массиве вместо тысяч строк.
export function typeIndex(Model) {
    return TYPE_INDEX.get(Model) ?? 0;
}

// То же по имени: так спрашивают график и панели, у которых на руках строка.
export function indexOfType(name) {
    return NAME_INDEX.get(name) ?? 0;
}

// Имя вида по его классу. Нужно там, где вид показывают человеку:
// в полях danger, target и dropAt лежат классы, и печатать их как есть
// значило бы вывалить в панель исходник класса целиком.
export function nameOfType(Model) {
    return typeByIndex(typeIndex(Model));
}

// Имя вида существа. Не поле, а поиск по реестру: снаружи имя нужно редко,
// а в горячем цикле существо опознают по классу.
export function liferName(lifer) {
    return nameOfType(lifer.constructor);
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
const FIELD_TABLE = new Map();

// Поля существа таблицей: колонки — классы иерархии, строки — поля.
//
// В каждой строке отмечено, какие классы это поле объявляют. Класс, объявивший
// последним, показывает нынешнее значение особи; объявившие раньше —
// то, что задавали сами, и по ним видно, что именно переопределено.
//
// Ячейка — либо null (класс поле не объявлял, оно унаследовано), либо {value}.
// Обёртка нужна, потому что само значение тоже бывает null: у id до попадания
// в мир, у behavior неподвижного вида, у danger и target — и пустая ячейка
// стала бы неотличима от унаследованной.
export function liferFieldTable(lifer) {
    const Model = lifer.constructor;

    if (!FIELD_TABLE.has(Model)) {
        FIELD_TABLE.set(Model, buildFieldTable(Model));
    }

    const table = FIELD_TABLE.get(Model);

    return {
        classes: table.classes,
        rows: table.rows.map((row) => ({
            field: row.field,
            cells: table.chain.map((Class, index) => {
                if (!row.declaredBy.includes(index)) {
                    return null;
                }
                // у последнего объявившего — то, что у особи сейчас:
                // она могла отойти от вида, отрастив радиус или почернев
                return {
                    value: index === row.owner ? lifer[row.field] : Class.prototype[row.field]
                };
            })
        }))
    };
}

function buildFieldTable(Model) {
    const chain = classChain(Model);
    // конструкторы всех моделей принимают (x, y); образец нужен, чтобы
    // увидеть поля экземпляра — на прототипе их нет
    const probes = chain.map((Class) => new Class(0, 0));
    const declared = new Map();

    const declare = (field, index) => {
        if (!declared.has(field)) {
            declared.set(field, []);
        }
        declared.get(field).push(index);
    };

    chain.forEach((Class, index) => {
        for (const field of SPECIES_FIELDS.get(Class) ?? []) {
            declare(field, index);
        }

        // конструктор дописывает собственные поля поверх родительских:
        // новым считается ключ, которого у образца родителя ещё не было
        const parent = probes[index - 1];
        for (const field of Object.keys(probes[index])) {
            if (!parent || !(field in parent)) {
                declare(field, index);
            }
        }
    });

    return {
        chain,
        classes: chain.map((Class) => Class.name),
        rows: [...declared].map(([field, declaredBy]) => ({
            field,
            declaredBy,
            owner: declaredBy[declaredBy.length - 1]
        }))
    };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
