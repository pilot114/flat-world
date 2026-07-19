import { Behavior, State } from './behavior.js';
import { History } from './history.js';
import { SpatialGrid } from './grid.js';
import { BERSERK_COLOR, createLifer, typeByIndex, typeIndex } from './species.js';
import { Random, randomSeed } from '../utils/random.js';
import { getRangeSquared } from '../utils/math.js';

// Байт на существо в полном слепке: id(4) type(1) x,y,dx,dy,speed,energy(8×6)
// ttl(2) radius(2) radiusView(2) kills(2) fed(2) stock(2) goods(2)
// berserkCounter(1) berserkTtl(2) state(1) load(1)
//
// ttl держится в Uint16: он детерминирован — убывает ровно на единицу за тик, —
// но вывести его в слепке не из чего, зато и четырёх байт ему не нужно.
// Самый долгий срок жизни в модели, десять минут, это 36000 тиков.
const SNAPSHOT_BYTES = 72;

// Как часто состояние мира пишется в историю (в тиках).
export const HISTORY_EVERY = 10;

// Как часто пишется ключевой кадр — полное состояние, с которого прогон
// может начаться. Реже кадров картинки: он на порядок тяжелее, а прогон
// от него идёт со скоростью около десяти тысяч тиков в секунду, так что
// триста тиков восстанавливаются за считаные миллисекунды.
const KEYFRAME_EVERY = 300;

// Сколько тиков соседнего интервала достраивать за один кадр отрисовки.
// Двадцать пять — около трёх миллисекунд: интервал успевает собраться
// за дюжину кадров, задолго до того, как перемотка до него дойдёт,
// и ни один кадр при этом не выходит за бюджет.
const PREFETCH_TICKS = 25;

// Сколько тиков отыгрывать за кадр, когда интервал нужен прямо сейчас —
// на старте воспроизведения или после броска ползунка. Сорок тиков это
// около пяти миллисекунд: интервал собирается за восемь кадров, а ни один
// из них не выходит за бюджет. Пока он собирается, отрисовка показывает
// последнее известное положение — отстаёт на десятые доли секунды, зато
// не спотыкается на сорок миллисекунд.
const URGENT_TICKS = 40;

// Во сколько обходится существо, восстановленное в объект. Не измеренная
// величина, а оценка: у объекта в V8 есть заголовок и таблица свойств поверх
// самих полей. Нужна только для строки о размере кэша — врать в разы она
// не будет, но точностью слепка (65 байт) её мерить нельзя.
const LIFER_BYTES = 200;

export class World {
    constructor(width, height, seed = randomSeed()) {
        this.width = width;
        this.height = height;

        // Мир владеет своей случайностью: без этого его нельзя переиграть,
        // а значит и восстановить состояние прошлого момента.
        this.seed = seed;
        this.random = new Random(seed);

        // Журнал внешних вмешательств — всё, чего мир не выводит сам:
        // заселение, подселение кликом, смена долей подсева. Прогон обязан
        // повторить их в тех же тиках, иначе он разойдётся с настоящим.
        this.journal = [];

        // полные слепки состояния: [{tick, snapshot}]
        this.keyframes = [];

        this.state = [];
        this.grid = new SpatialGrid(width, height);
        // кадры картинки, с начала жизни мира и до текущего тика
        this.history = new History();
        this.tick = 0;
        this.ms = 0;
        this.nextId = 1;

        // Выделение — это id, а не ссылка на объект. Существо, выделенное
        // в кадре истории, к текущему тику могло быть съедено; id переживает
        // его и позволяет помечать существо в тех кадрах, где оно ещё живо.
        this.selectId = 0;

        this.counts = {};
        this.totalTypes = 0;
        // виды-бойцы считаем отдельно: матч не должен зависеть от травы и коров
        this.competitorTypes = 0;
        this.stopped = false;

        // Размножаются ли существа. Механика есть у вида, но включает её мир:
        // иначе коровы плодились бы и в сценариях, чей баланс держится
        // на подсеве, а не на еде.
        this.breeding = false;

        // Разыгрывается ли в этом мире матч. Песочница его не разыгрывает:
        // там первый же подселённый боец оказался бы единственным видом
        // и остановил бы время, не дав добавить ему соперника.
        this.matchEnds = true;

        // подсев: [{type, chance}] — вероятность появления одной особи за тик
        this.spawns = [];

        // вызывается один раз, когда остаётся один вид бойцов
        this.onFinish = null;

        // Сколько событий журнала уже применено. Живой мир применяет их сразу,
        // восстановленный — по мере того, как доходит до их тиков.
        this.journalCursor = 0;

        // Восстановленный мир историю не пишет: она у него уже есть.
        this.recording = true;

        // последний восстановленный момент: {tick, world}
        this.replayed = null;

        // Выделенное существо по кадрам ключевого интервала: текущий интервал
        // и соседний, который достраивается заранее.
        this.selection = null;
        this.neighbour = null;
        this.selectionTick = Infinity;
        // последнее показанное — им отвечаем, пока интервал досчитывается
        this.shown = null;
    }

    // Применить вмешательства, назначенные на текущий тик и раньше.
    // Живой мир доходит сюда с пустой очередью — он применил их при записи;
    // прогон именно здесь и повторяет клики пользователя.
    applyJournal() {
        while (this.journalCursor < this.journal.length
            && this.journal[this.journalCursor].tick <= this.tick) {
            const event = this.journal[this.journalCursor++];

            if (event.kind === 'populate') {
                this.applyPopulate(event.type, event.count);
            } else if (event.kind === 'place') {
                this.applyPlace(event.type, event.x, event.y);
            } else {
                this.applySpawnRate(event.type, event.chance);
            }
        }
    }

    // Живое выделенное существо или null, если его уже съели. Разрешается
    // на лету, поэтому отдельно снимать выделение при удалении не нужно.
    get select() {
        if (!this.selectId) {
            return null;
        }
        return this.state.find((object) => object.id === this.selectId) ?? null;
    }

    set select(object) {
        this.selectId = object ? object.id : 0;
    }

    add(object) {
        object.id = this.nextId++;
        this.state.push(object);
        this.grid.insert(object);
        return object;
    }

    // Постоянный подсев вида: chance — вероятность одной особи за тик.
    // Без него травоядная цепочка вымирает, съев всю траву.
    setSpawnRate(type, chance) {
        this.record({ kind: 'spawnRate', type, chance });
        this.applySpawnRate(type, chance);
    }

    // Заселить мир: count существ указанного типа в случайных точках.
    populate(type, count) {
        this.record({ kind: 'populate', type, count });
        this.applyPopulate(type, count);
    }

    // Подселить существо в заданную точку — так работает клик по канвасу.
    place(type, x, y) {
        this.record({ kind: 'place', type, x, y });
        return this.applyPlace(type, x, y);
    }

    // Запись в журнал. Событие относится к тику, который ещё не сыгран:
    // вмешательство случается между тиками, и прогон должен применить его
    // перед тем же тиком, иначе порядок в state — а с ним и ход обхода —
    // окажется другим.
    record(event) {
        if (!this.recording) {
            return;
        }

        this.journal.push({ tick: this.tick, ...event });
        // живой мир применяет вмешательство тут же, а не ждёт своего тика
        this.journalCursor = this.journal.length;
        // прошлое, восстановленное до этого вмешательства, больше не годится
        this.replayed = null;
        this.selection = null;
        this.neighbour = null;
        this.shown = null;
    }

    // Сами действия, без записи: их зовёт и журнал при воспроизведении,
    // и подсев внутри тика — тот выводится из случайности мира и в журнал
    // не пишется, иначе прогон применил бы его дважды.
    applySpawnRate(type, chance) {
        this.spawns = this.spawns.filter((spawn) => spawn.type !== type);
        if (chance > 0) {
            this.spawns.push({ type, chance });
        }
    }

    applyPopulate(type, count) {
        for (let i = 0; i < count; i++) {
            const { x, y } = this.random.point(this.width, this.height);
            this.add(createLifer(type, x, y));
        }
    }

    applyPlace(type, x, y) {
        return this.add(createLifer(type, x, y));
    }

    remove(object) {
        if (object.removed) {
            return;
        }

        object.removed = true;
        this.state = this.state.filter((el) => el !== object);
        this.grid.remove(object);
    }

    // Выделить существо, ближайшее к точке клика.
    selectByLocation(location) {
        const nearest = nearestTo(this.state, location);
        this.select = nearest;
        return nearest;
    }

    // То же при перемотке: целимся в тех, кто был жив на показанном тике.
    // Состояние того момента восстанавливается точно, поэтому искать можно
    // прямо в нём — кадру картинки хранить id для этого не нужно.
    selectByLocationAt(tick, location) {
        const nearest = nearestTo(this.at(tick).state, location);
        this.selectId = nearest ? nearest.id : 0;
        return nearest;
    }

    // Выделенное существо таким, каким оно было на указанном тике: настоящий
    // объект восстановленного мира, со всеми полями того момента. Панель
    // и пометка на канвасе берут данные отсюда, а не у живого мира —
    // иначе они показывали бы «сейчас» поверх картинки из прошлого.
    // Точный ответ: интервал доигрывается до конца, сколько бы это ни стоило.
    // Так спрашивают клик и тесты — им нужен результат здесь и сейчас.
    selectionAt(tick) {
        if (!this.selectId) {
            return null;
        }

        this.selectionTick = tick;
        this.ensure(tick, Infinity);
        return this.selection.byTick.get(tick) ?? null;
    }

    // Ответ для отрисовки: кадр не должен уходить в прогон на сорок
    // миллисекунд. Если интервал ещё не досчитан, добираем кусочек и отдаём
    // последнее известное — оно отстанет на несколько кадров и догонит само.
    selectionFor(tick) {
        if (!this.selectId) {
            this.shown = null;
            return null;
        }

        const back = tick <= this.selectionTick;
        this.selectionTick = tick;

        this.ensure(tick, URGENT_TICKS);
        this.prefetch(back);

        if (this.holds(this.selection, tick)) {
            this.shown = this.selection.byTick.get(tick) ?? null;
        }

        return this.shown ?? null;
    }

    // Довести текущий интервал до состояния, в котором он отвечает про tick.
    // ticks ограничивает работу за один заход.
    ensure(tick, ticks) {
        if (this.selection && this.selection.id !== this.selectId) {
            this.selection = null;
            this.neighbour = null;
            this.shown = null;
        }

        if (this.holds(this.selection, tick)) {
            return;
        }

        if (!this.owns(this.selection, tick)) {
            // сосед мог готовиться как раз под этот участок
            this.selection = this.owns(this.neighbour, tick)
                ? this.neighbour
                : this.startInterval(tick);
            this.neighbour = null;
        }

        this.advance(this.selection, ticks);
    }

    // Интервал уже отвечает про этот тик.
    holds(interval, tick) {
        return this.owns(interval, tick) && tick <= interval.to;
    }

    // Интервал про этот тик, но, может быть, ещё не досчитан.
    owns(interval, tick) {
        return Boolean(interval) && interval.id === this.selectId
            && tick >= interval.from && tick <= interval.limit;
    }

    // Достраиваем соседний интервал по кусочку за кадр, не дожидаясь, пока
    // он понадобится.
    //
    // Иначе на границе интервала один кадр отрисовки отыгрывал бы триста тиков
    // разом: сорок миллисекунд при бюджете в семнадцать — те самые рывки
    // на перемотке назад. Вперёд их нет только потому, что там мир считается
    // дальше сам, без восстановления.
    //
    // Назад интервал нужен целиком и сразу: перемотка входит в него с конца,
    // а достраивается он с начала. Поэтому важно успеть до перехода — запас
    // и берём, начиная сразу после входа в текущий интервал.
    prefetch(back) {
        const anchor = back ? this.selection.from - 1 : this.selection.to + 1;

        if (anchor < 0 || anchor > this.tick) {
            this.neighbour = null;
            return;
        }

        if (!this.neighbour || this.neighbour.id !== this.selectId
            || anchor < this.neighbour.from || anchor > this.neighbour.limit) {
            this.neighbour = this.startInterval(anchor);
        }

        this.advance(this.neighbour, PREFETCH_TICKS);
    }

    // Интервал, начатый с ключевого кадра: слепок загружен, но не отыгран.
    startInterval(tick) {
        const world = this.replayWorld(this.keyframeFor(tick));

        return {
            id: this.selectId,
            world,
            from: world.tick,
            limit: Math.min(world.tick + KEYFRAME_EVERY - 1, this.tick),
            // пока не отыграно ни одного тика, покрывать нечего
            to: world.tick - 1,
            byTick: new Map()
        };
    }

    // Отыграть не больше ticks тиков интервала, снимая выделенное с кадров.
    advance(interval, ticks) {
        const world = interval.world;
        if (!world) {
            return;
        }

        const until = Math.min(interval.limit, world.tick + ticks - 1);

        while (world.tick <= until && !world.stopped) {
            world.update(0);

            // состояние после отыгранного тика — то же, что показывает кадр
            const played = world.tick - 1;
            if (played % HISTORY_EVERY === 0) {
                const lifer = world.byId(interval.id);
                interval.byTick.set(played, lifer ? copyOf(lifer) : null);
            }
            interval.to = played;
        }

        if (world.tick > interval.limit || world.stopped) {
            interval.world = null;
        }
    }

    // Ближайший объект нужного вида во всём мире, а не в радиусе обзора:
    // постройки стоят где поставили, и до них обычно не видно.
    // ready — брать только те, которым есть что отдать.
    nearestOf(from, type, ready) {
        let nearest = null;
        let nearestRange = Infinity;

        for (const object of this.state) {
            if (object.type !== type || (ready && !object.canGive())) {
                continue;
            }

            const range = getRangeSquared(from, object);
            if (range < nearestRange) {
                nearest = object;
                nearestRange = range;
            }
        }

        return nearest;
    }

    // Соседи в радиусе обзора существа (само существо не входит).
    getNear(lifer) {
        return this.grid.collect(lifer, lifer.radiusView, []);
    }

    update(time) {
        // Остановленный матч замер целиком. Раньше выход стоял ниже, и мир
        // после победы продолжал подсеивать траву, тратя на это случайность:
        // время как будто стояло, а поток случайных чисел уходил вперёд.
        if (this.stopped) {
            return;
        }

        this.applyJournal();

        // Ключевой кадр снимается здесь — до того, как тик что-либо изменил.
        // Это и есть «состояние на тике K»: с него прогон начинается, и первым
        // же вызовом update повторяет ровно то, что случилось тогда.
        if (this.recording && this.tick % KEYFRAME_EVERY === 0) {
            this.pushKeyframe();
        }

        // сначала меняем состав мира, потом считаем — иначе счётчики отстают на тик
        for (const spawn of this.spawns) {
            // подсев выводится из случайности мира, поэтому в журнал не пишется:
            // прогон получит те же числа из того же потока
            if (this.random.next() < spawn.chance) {
                this.applyPopulate(spawn.type, 1);
            }
        }

        this.refreshCounts();
        this.checkFinish();
        if (this.stopped) {
            return;
        }
        // страховка от изменений координат в обход update()
        this.grid.rebuild(this.state);

        // remove() создаёт новый массив, поэтому обход идёт по составу мира на начало тика
        for (const object of this.state) {
            // существо могли съесть в этом же тике
            if (object.removed) {
                continue;
            }

            object.update(this);

            // существо сдвинулось — поддерживаем сетку в актуальном состоянии
            if (!object.removed) {
                this.grid.update(object);
            }
        }

        if (this.recording && this.tick % HISTORY_EVERY === 0) {
            this.history.push(this);
        }

        this.tick++;
        this.ms = time;
    }

    // Временный кэш перемотки: восстановленные миры и снятые с них копии
    // выделенного существа. Живёт только пока идёт просмотр истории, но
    // памяти занимает не меньше десятков килобайт — поэтому показывается
    // отдельной строкой, а не прячется внутри истории.
    get cacheBytes() {
        let bytes = 0;

        for (const interval of [this.selection, this.neighbour]) {
            if (!interval) {
                continue;
            }
            bytes += interval.byTick.size * LIFER_BYTES;
            if (interval.world) {
                bytes += interval.world.state.length * LIFER_BYTES;
            }
        }

        if (this.replayed) {
            bytes += this.replayed.world.state.length * LIFER_BYTES;
        }

        return bytes;
    }

    // Сколько памяти история занимает на самом деле: колонки кадров плюс
    // полные слепки. Считается по буферам, а не по полезным байтам —
    // прежний счётчик занижал расход в сотни раз.
    get historyBytes() {
        let bytes = this.history.bytes;

        for (const keyframe of this.keyframes) {
            bytes += keyframe.bytes;
        }

        return bytes;
    }

    // Полный слепок: всё, чего не вывести из вида существа. Кадр картинки
    // для этого не годится — в нём нет ни импульса, ни запаса сил, ни
    // счётчиков, а без них продолжить симуляцию нельзя.
    //
    // Дробные величины пишутся в Float64: speed растёт шажками по 0.1,
    // energy — долями, и в половинной точности повтор разошёлся бы с оригиналом.
    // Всё хранится в одном буфере, а не в пятнадцати типизированных массивах:
    // каждый такой массив стоит около сотни байт сам по себе, независимо
    // от длины, и на редком населении накладные расходы перевешивали данные
    // на порядок. Виды поверх буфера создаются только на время чтения и записи.
    captureSnapshot() {
        const count = this.state.length;
        const buffer = new ArrayBuffer(SNAPSHOT_BYTES * count);
        const columns = snapshotColumns(buffer, count);

        for (let i = 0; i < count; i++) {
            writeSnapshotRow(columns, i, this.state[i]);
        }

        return {
            tick: this.tick,
            nextId: this.nextId,
            // состояние ГПСЧ — без него прогон пошёл бы по другой случайности
            randomState: this.random.state,
            stopped: this.stopped,
            spawns: this.spawns.map((spawn) => ({ ...spawn })),
            journalCursor: this.journalCursor,
            count,
            buffer,
            bytes: buffer.byteLength
        };
    }

    loadSnapshot(snapshot) {
        this.tick = snapshot.tick;
        this.nextId = snapshot.nextId;
        this.random.state = snapshot.randomState;
        this.stopped = snapshot.stopped;
        this.spawns = snapshot.spawns.map((spawn) => ({ ...spawn }));
        this.journalCursor = snapshot.journalCursor;
        this.state = [];

        const columns = snapshotColumns(snapshot.buffer, snapshot.count);

        for (let i = 0; i < snapshot.count; i++) {
            const lifer = createLifer(typeByIndex(columns.types[i]), columns.xs[i], columns.ys[i]);

            lifer.id = columns.ids[i];
            lifer.dx = columns.dxs[i];
            lifer.dy = columns.dys[i];
            lifer.radius = columns.radii[i];
            lifer.radiusView = columns.views[i];

            // присваиваем только то, что у вида вообще есть: лишнее поле
            // на траве изменило бы её набор полей и панель вместе с ним
            if ('ttl' in lifer) {
                lifer.ttl = columns.ttls[i];
            }
            if ('energy' in lifer) {
                lifer.energy = columns.energies[i];
                lifer.speed = columns.speeds[i];
                lifer.fed = columns.fed[i];
            }
            if ('load' in lifer) {
                lifer.load = columns.load[i];
            }
            if ('stock' in lifer) {
                lifer.stock = columns.stock[i];
                lifer.goods = columns.goods[i];
            }
            if ('kills' in lifer) {
                lifer.kills = columns.kills[i];
                lifer.berserkCounter = columns.berserkCounters[i];
                lifer.berserkTtl = columns.berserkTtls[i];
            }
            if (columns.states[i]) {
                lifer.state = State.BERSERK;
                lifer.color = BERSERK_COLOR;
            }

            this.state.push(lifer);
        }

        this.grid.rebuild(this.state);
        this.refreshCounts();
    }

    pushKeyframe() {
        this.keyframes.push(this.captureSnapshot());
    }

    // Мир на указанном тике: состояние после того, как этот тик отыгран, —
    // ровно то, что показывает кадр картинки с этим номером.
    //
    // Восстанавливается прогоном от ближайшего ключевого кадра. Считать это
    // на каждый кадр отрисовки незачем, поэтому последний результат хранится:
    // при перемотке позиция меняется куда реже, чем перерисовывается канвас.
    at(tick) {
        if (this.replayed && this.replayed.tick === tick) {
            return this.replayed.world;
        }

        const world = this.replay(tick);
        this.replayed = { tick, world };
        return world;
    }

    replay(tick) {
        const world = this.replayWorld(this.keyframeFor(tick));

        // догоняем до нужного тика; остановленный матч дальше не идёт,
        // и без этой проверки цикл не кончился бы никогда
        while (world.tick <= tick && !world.stopped) {
            world.update(0);
        }

        return world;
    }

    // Мир, готовый к прогону с ключевого кадра: истории не пишет, журнал
    // и случайность берёт у настоящего.
    replayWorld(keyframe) {
        const world = new World(this.width, this.height, this.seed);

        world.recording = false;
        world.matchEnds = this.matchEnds;
        world.breeding = this.breeding;
        world.journal = this.journal;

        if (keyframe) {
            world.loadSnapshot(keyframe);
        }

        return world;
    }

    // Последний ключевой кадр не позже указанного тика.
    keyframeFor(tick) {
        let found = null;

        for (const keyframe of this.keyframes) {
            if (keyframe.tick > tick) {
                break;
            }
            found = keyframe;
        }

        return found;
    }

    byId(id) {
        return this.state.find((object) => object.id === id) ?? null;
    }

    // decorateSelect рисует пометки выделенного существа (подпись, радиус обзора):
    // показывать их для всех — значит затянуть канвас паутиной окружностей.
    draw(context, decorateSelect, part = 0) {
        for (const object of this.state) {
            object.draw(context, part);
        }

        if (this.select && decorateSelect) {
            decorateSelect(context, this.select, part);
        }
    }

    hasLife() {
        return this.state.length > 0;
    }

    // Пересчитывает количество существ по видам (раз в тик).
    refreshCounts() {
        const counts = {};
        const competitors = new Set();

        for (const object of this.state) {
            counts[object.type] = (counts[object.type] || 0) + 1;
            if (isCompetitor(object)) {
                competitors.add(object.type);
            }
        }

        this.counts = counts;
        this.totalTypes = Object.keys(counts).length;
        this.competitorTypes = competitors.size;
        return counts;
    }

    getCounts() {
        return this.counts;
    }

    maxCounts() {
        const values = Object.values(this.counts);
        return values.length > 0 ? Math.max(...values) : 0;
    }

    // Матч заканчивается, когда остаётся один вид бойцов —
    // доживающие своё коровы и призраки его не задерживают.
    checkFinish() {
        if (!this.matchEnds || this.stopped || this.competitorTypes !== 1) {
            return;
        }

        const winner = this.state.find(isCompetitor);
        if (!winner) {
            return;
        }

        this.stopped = true;
        if (this.onFinish) {
            this.onFinish(winner.type);
        }
    }
}

// Роль вида постоянна, поэтому временные режимы её не скрывают:
// боец остаётся бойцом, чем бы он ни был занят сейчас.
function writeSnapshotRow(columns, i, object) {
    columns.ids[i] = object.id;
    columns.types[i] = typeIndex(object.type);
    columns.xs[i] = object.x;
    columns.ys[i] = object.y;
    columns.dxs[i] = object.dx;
    columns.dys[i] = object.dy;

    columns.radii[i] = object.radius;
    columns.views[i] = object.radiusView;
    columns.states[i] = object.state === State.BERSERK ? 1 : 0;

    // поля есть не у всех: трава не двигается и не стареет
    columns.ttls[i] = object.ttl ?? 0;
    columns.speeds[i] = object.speed ?? 0;
    columns.energies[i] = object.energy ?? 0;
    columns.fed[i] = object.fed ?? 0;
    columns.load[i] = object.load ?? 0;
    columns.stock[i] = object.stock ?? 0;
    columns.goods[i] = object.goods ?? 0;
    columns.kills[i] = object.kills ?? 0;
    columns.berserkCounters[i] = object.berserkCounter ?? 0;
    columns.berserkTtls[i] = object.berserkTtl ?? 0;
}

// Существо в сохранённом виде: [{name, value, type}] — прямо из буфера
// ключевого кадра, без живого объекта. Это и есть ответ на вопрос «в каком
// виде оно хранится»: не пересчёт на глаз, а те самые записанные числа.
//
// null, если в этом кадре такого id нет — существо ещё не родилось
// или его уже съели.
export function storedRow(snapshot, id) {
    const columns = snapshotColumns(snapshot.buffer, snapshot.count);
    const index = columns.ids.indexOf(id);

    if (index === -1) {
        return null;
    }

    return [
        ['id', columns.ids[index], 'Uint32'],
        ['type', columns.types[index], 'Uint8'],
        ['x', columns.xs[index], 'Float64'],
        ['y', columns.ys[index], 'Float64'],
        ['dx', columns.dxs[index], 'Float64'],
        ['dy', columns.dys[index], 'Float64'],
        ['speed', columns.speeds[index], 'Float64'],
        ['energy', columns.energies[index], 'Float64'],
        ['ttl', columns.ttls[index], 'Uint16'],
        ['radius', columns.radii[index], 'Uint16'],
        ['radiusView', columns.views[index], 'Uint16'],
        ['kills', columns.kills[index], 'Uint16'],
        ['fed', columns.fed[index], 'Uint16'],
        ['load', columns.load[index], 'Uint8'],
        ['stock', columns.stock[index], 'Uint16'],
        ['goods', columns.goods[index], 'Uint16'],
        ['berserkCounter', columns.berserkCounters[index], 'Uint8'],
        ['berserkTtl', columns.berserkTtls[index], 'Uint16'],
        ['state', columns.states[index], 'Uint8']
    ].map(([name, value, type]) => ({ name, value, type }));
}

// Какие id попали в этот кадр. id выдаются подряд, но к любому моменту часть
// их владельцев уже съедена, а часть ещё не родилась — без этой подсказки
// ползунок по id тыкался бы вслепую.
export function storedIdRange(snapshot) {
    if (!snapshot.count) {
        return null;
    }

    const columns = snapshotColumns(snapshot.buffer, snapshot.count);
    let min = Infinity;
    let max = 0;

    for (let i = 0; i < snapshot.count; i++) {
        const id = columns.ids[i];
        min = Math.min(min, id);
        max = Math.max(max, id);
    }

    return { min, max };
}

// Что записано в ключевом кадре помимо существ: состояние самого мира.
// Без него слепок не полон — с одних координат симуляцию не продолжить.
export function storedWorld(snapshot) {
    return [
        ['tick', snapshot.tick],
        ['count', snapshot.count],
        ['nextId', snapshot.nextId],
        ['randomState', snapshot.randomState],
        ['journalCursor', snapshot.journalCursor],
        ['stopped', snapshot.stopped],
        ['spawns', snapshot.spawns.map((spawn) => spawn.type + ':' + spawn.chance).join(' ') || '—'],
        ['bytes', snapshot.bytes]
    ].map(([name, value]) => ({ name, value }));
}

// Виды на колонки слепка внутри общего буфера. Порядок продиктован
// выравниванием: сначала восьмибайтные величины, потом четырёх-, двух-
// и однобайтные — иначе типизированный массив не лёг бы по своему смещению.
function snapshotColumns(buffer, count) {
    let offset = 0;

    const block = (Type, width) => {
        const column = new Type(buffer, offset, count);
        offset += width * count;
        return column;
    };

    return {
        xs: block(Float64Array, 8),
        ys: block(Float64Array, 8),
        dxs: block(Float64Array, 8),
        dys: block(Float64Array, 8),
        speeds: block(Float64Array, 8),
        energies: block(Float64Array, 8),
        ids: block(Uint32Array, 4),
        ttls: block(Uint16Array, 2),
        radii: block(Uint16Array, 2),
        views: block(Uint16Array, 2),
        kills: block(Uint16Array, 2),
        fed: block(Uint16Array, 2),
        stock: block(Uint16Array, 2),
        goods: block(Uint16Array, 2),
        berserkTtls: block(Uint16Array, 2),
        types: block(Uint8Array, 1),
        berserkCounters: block(Uint8Array, 1),
        states: block(Uint8Array, 1),
        load: block(Uint8Array, 1)
    };
}

// Копия существа на память. Прототип сохраняем: без него панель не разложит
// поля по классам, а вид потеряет цвет и радиус обзора — они лежат там же.
function copyOf(lifer) {
    return Object.assign(Object.create(Object.getPrototypeOf(lifer)), lifer);
}

// Ближайший к точке объект списка, либо null.
function nearestTo(objects, location) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const object of objects) {
        const dx = location.x - object.x;
        const dy = location.y - object.y;
        const distance = dx * dx + dy * dy;

        if (distance < nearestDistance) {
            nearest = object;
            nearestDistance = distance;
        }
    }

    return nearest;
}

function isCompetitor(object) {
    return object.behavior === Behavior.COMPETE;
}
