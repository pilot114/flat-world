import { Behavior } from './behavior.js';
import { SpatialGrid } from './grid.js';
import { createLifer, typeIndex } from './lifers.js';
import { randCoordGenerate } from '../utils/math.js';

// Старший бит поля типа — признак берсерка.
export const BERSERK_BIT = 0x80;
const TYPE_MASK = 0x7f;
const MAX_RADIUS = 255;

// Как часто состояние мира пишется в историю (в тиках).
const HISTORY_EVERY = 10;
// Сколько кадров храним: 600 кадров ≈ 100 секунд, дальше старые вытесняются.
const HISTORY_LIMIT = 600;

export class World {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        this.state = [];
        this.grid = new SpatialGrid(width, height);
        // кадры для перемотки: [{tick, records}], старые вытесняются
        this.history = [];
        // размер истории считаем на лету: обходить её каждый кадр ради счётчика — дорого
        this.historyBytes = 0;
        this.tick = 0;
        this.ms = 0;
        this.nextId = 1;
        this.select = null;

        this.counts = {};
        this.totalTypes = 0;
        // виды-бойцы считаем отдельно: матч не должен зависеть от травы и коров
        this.competitorTypes = 0;
        this.stopped = false;

        // подсев: [{type, chance}] — вероятность появления одной особи за тик
        this.spawns = [];

        // вызывается один раз, когда остаётся один вид бойцов
        this.onFinish = null;
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

        if (this.select === object) {
            this.select = null;
        }
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

        for (let i = 0; i < count; i++) {
            const object = this.state[i];
            // для картинки хватает целых пикселей
            xs[i] = Math.round(object.x);
            ys[i] = Math.round(object.y);
            radii[i] = Math.min(MAX_RADIUS, Math.round(object.radius));
            types[i] = typeIndex(object.type) | (object.isBerserk() ? BERSERK_BIT : 0);
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
            bytes: xs.byteLength + ys.byteLength + radii.byteLength + types.byteLength
        };
    }

    pushFrame() {
        const frame = this.captureFrame();

        this.history.push(frame);
        this.historyBytes += frame.bytes;

        if (this.history.length > HISTORY_LIMIT) {
            this.historyBytes -= this.history.shift().bytes;
        }
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
        if (this.stopped || this.competitorTypes !== 1) {
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

function isCompetitor(object) {
    return object.behavior === Behavior.COMPETE || object.behavior === Behavior.BERSERK;
}
