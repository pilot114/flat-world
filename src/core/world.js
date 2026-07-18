import { Behavior } from './behavior.js';
import { SpatialGrid } from './grid.js';
import { createLifer, liferViewRadius, typeByIndex, typeIndex } from './species.js';
import { randCoordGenerate } from '../utils/math.js';

const MAX_RADIUS = 255;

// Как часто состояние мира пишется в историю (в тиках).
const HISTORY_EVERY = 10;

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        this.state = [];
        this.grid = new SpatialGrid(width, height);
        // кадры для перемотки, с начала жизни мира и до текущего тика
        this.history = [];
        // размер истории считаем на лету: обходить её каждый кадр ради счётчика — дорого
        this.historyBytes = 0;
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

        // Разыгрывается ли в этом мире матч. Песочница его не разыгрывает:
        // там первый же подселённый боец оказался бы единственным видом
        // и остановил бы время, не дав добавить ему соперника.
        this.matchEnds = true;

        // подсев: [{type, chance}] — вероятность появления одной особи за тик
        this.spawns = [];

        // вызывается один раз, когда остаётся один вид бойцов
        this.onFinish = null;
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
        this.spawns = this.spawns.filter((spawn) => spawn.type !== type);
        if (chance > 0) {
            this.spawns.push({ type, chance });
        }
    }

    // Заселить мир: count существ указанного типа в случайных точках.
    populate(type, count) {
        const randCoords = randCoordGenerate(this.width, this.height);
        for (let i = 0; i < count; i++) {
            const [x, y] = randCoords();
            this.add(createLifer(type, x, y));
        }
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
        let nearest = null;
        let nearestDistance = Infinity;

        for (const object of this.state) {
            const dx = location.x - object.x;
            const dy = location.y - object.y;
            const distance = dx * dx + dy * dy;

            if (distance < nearestDistance) {
                nearest = object;
                nearestDistance = distance;
            }
        }

        this.select = nearest;
        return nearest;
    }

    // Выделение при перемотке. Целиться нужно в кадр, а не в живой мир:
    // на канвасе картинка из прошлого, а живые существа стоят уже в других
    // местах — по ним клик попадал бы мимо того, по чему пользователь щёлкнул.
    //
    // Выделяем по id из кадра, не проверяя, жив ли ещё его владелец: чем
    // глубже перемотка, тем больше показанного уже съедено, и требовать
    // живого значило бы отказывать в выделении как раз там, где перемотка
    // и нужна. Панель полей останется пустой — их негде взять, — но пометка
    // на канвасе будет.
    selectByFrameLocation(frame, location) {
        let nearestId = 0;
        let nearestDistance = Infinity;

        for (let i = 0; i < frame.count; i++) {
            const dx = location.x - frame.xs[i];
            const dy = location.y - frame.ys[i];
            const distance = dx * dx + dy * dy;

            if (distance < nearestDistance) {
                nearestId = frame.ids[i];
                nearestDistance = distance;
            }
        }

        this.selectId = nearestId;
        return this.select;
    }

    // Чем пометить выделенное существо поверх кадра истории, или null, если
    // в этом кадре его нет. Координаты берём из кадра: на паузе живое
    // существо стоит уже в другом месте, и круг повис бы в стороне.
    selectionInFrame(frame) {
        if (!this.selectId) {
            return null;
        }

        const index = frame.ids.indexOf(this.selectId);
        if (index === -1) {
            return null;
        }

        const live = this.select;

        return {
            id: this.selectId,
            x: frame.xs[index],
            y: frame.ys[index],
            // у живого радиус обзора точный; у съеденного берём видовой —
            // в кадре его нет, а у бойца он ещё и растёт с убийствами
            radiusView: live ? live.radiusView : liferViewRadius(typeByIndex(frame.types[index]))
        };
    }

    // Соседи в радиусе обзора существа (само существо не входит).
    getNear(lifer) {
        return this.grid.collect(lifer, lifer.radiusView, []);
    }

    update(time) {
        // сначала меняем состав мира, потом считаем — иначе счётчики отстают на тик
        for (const spawn of this.spawns) {
            if (Math.random() < spawn.chance) {
                this.populate(spawn.type, 1);
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

        if (this.tick % HISTORY_EVERY === 0) {
            this.pushFrame();
        }

        this.tick++;
        this.ms = time;
    }

    // Кадр истории: параллельные типизированные массивы вместо строки на существо.
    // Строки здесь обходятся в ~200 байт каждая — на 600 кадрах это сотня мегабайт.
    captureFrame() {
        const count = this.state.length;
        const xs = new Int16Array(count);
        const ys = new Int16Array(count);
        const radii = new Uint8Array(count);
        const types = new Uint8Array(count);
        // состояние существа хранится отдельно от вида: их смысл разный,
        // а лишний байт на особь дешевле, чем потолок в 127 видов
        const flags = new Uint8Array(count);
        // единственное, что связывает точку в кадре с живым существом:
        // без id клик при перемотке не знал бы, по кому попал.
        // Uint32, а не Uint16: nextId растёт всю жизнь мира, и на длинном
        // прогоне 16 бит переполнились бы, молча подменив выделенного
        const ids = new Uint32Array(count);

        for (let i = 0; i < count; i++) {
            const object = this.state[i];
            // для картинки хватает целых пикселей
            xs[i] = Math.round(object.x);
            ys[i] = Math.round(object.y);
            radii[i] = Math.min(MAX_RADIUS, Math.round(object.radius));
            types[i] = typeIndex(object.type);
            flags[i] = object.frameFlags();
            ids[i] = object.id;
        }

        return {
            tick: this.tick,
            // counts пересоздаётся в refreshCounts каждый тик, копия не нужна:
            // график читает из кадра, поэтому пауза и перемотка действуют и на него
            counts: this.counts,
            count,
            xs,
            ys,
            radii,
            types,
            flags,
            ids,
            bytes: xs.byteLength + ys.byteLength + radii.byteLength + types.byteLength
                + flags.byteLength + ids.byteLength
        };
    }

    // История хранится целиком: перемотать можно к любому моменту с начала
    // мира, а не только на последние полторы минуты. Растёт она линейно
    // от населения — счётчик historyBytes держит этот рост на виду.
    pushFrame() {
        const frame = this.captureFrame();

        this.history.push(frame);
        this.historyBytes += frame.bytes;
    }

    // decorateSelect рисует пометки выделенного существа (подпись, радиус обзора):
    // показывать их для всех — значит затянуть канвас паутиной окружностей.
    draw(context, decorateSelect) {
        for (const object of this.state) {
            object.draw(context);
        }

        if (this.select && decorateSelect) {
            decorateSelect(context, this.select);
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
function isCompetitor(object) {
    return object.behavior === Behavior.COMPETE;
}
