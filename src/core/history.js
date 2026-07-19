import { liferTypes, typeByIndex, typeIndex } from './species.js';

// Кадры картинки: координаты, размер, вид и состояние каждого существа.
//
// Хранятся не массивом объектов, а несколькими растущими типизированными
// массивами — по колонке на величину, все кадры подряд. Причина в накладных
// расходах: объект-кадр с пятью типизированными массивами и объектом счётчиков
// обходится примерно в 1300 байт независимо от того, одно в нём существо
// или триста. На пустом мире история росла на мегабайты, показывая при этом
// нулевой размер.
//
// Здесь на кадр приходится четырнадцать байт служебных данных и ровно
// семь байт на существо, без единого объекта.

const TYPES = liferTypes();
const BYTES_PER_LIFER = 11; // x, y (Int16) + radius, type, flags (Uint8) + id (Uint32)

const MAX_RADIUS = 255;

export class History {
    constructor() {
        this.length = 0;

        // Буферы выделяются при первой записи, а не сразу: восстановленные
        // миры историю не пишут вовсе, и сотня килобайт на каждый временный
        // прогон уходила бы впустую.
        this.ticks = new Int32Array(0);
        this.offsets = new Uint32Array(0);
        this.sizes = new Uint32Array(0);
        // численность по видам: TYPES.length чисел на кадр
        this.species = new Uint16Array(0);

        // сплошной поток кадров
        this.payload = new Uint8Array(0);
        this.used = 0;

        // переиспользуемый буфер под промежуточные кадры
        this.scratch = null;
    }

    // Сколько памяти история занимает на самом деле — вместе со служебными
    // колонками и незаполненным хвостом выделенных буферов. Считать только
    // полезные байты значило бы врать: именно этим прежний счётчик и грешил.
    get bytes() {
        return this.payload.byteLength
            + this.ticks.byteLength
            + this.offsets.byteLength
            + this.sizes.byteLength
            + this.species.byteLength;
    }

    push(world) {
        const count = world.state.length;
        // размер кадра округляем до кратного четырём: Uint32Array нельзя
        // положить по произвольному смещению, а кадры идут в буфере вплотную
        const size = (count * BYTES_PER_LIFER + 3) & ~3;
        const index = this.length;

        this.reserve(index, size);

        const offset = this.used;
        this.ticks[index] = world.tick;
        this.offsets[index] = offset;
        this.sizes[index] = count;

        const columns = this.viewsAt(offset, count);
        const { types } = columns;
        const species = this.species;
        const base = index * TYPES.length;
        species.fill(0, base, base + TYPES.length);

        for (let i = 0; i < count; i++) {
            const object = world.state[i];

            writeFrameRow(columns, i, object);
            species[base + types[i]]++;
        }

        this.used += size;
        this.length++;
    }

    tickAt(index) {
        return this.ticks[index];
    }

    // Кадр для отрисовки. Виды создаются поверх общего буфера и живут ровно
    // до конца отрисовки — своей памяти у них нет.
    at(index) {
        const count = this.sizes[index];

        return {
            tick: this.ticks[index],
            count,
            ...this.viewsAt(this.offsets[index], count)
        };
    }

    // Численность по видам на кадре — в том виде, в каком её ждёт панель.
    countsAt(index) {
        const counts = {};
        const base = index * TYPES.length;

        for (let i = 0; i < TYPES.length; i++) {
            if (this.species[base + i] > 0) {
                counts[typeByIndex(i)] = this.species[base + i];
            }
        }

        return counts;
    }

    // Ряд численности одного вида по кадрам [from, to] — то, что рисует график.
    seriesOf(type, from, to) {
        const column = typeIndex(type);
        const values = [];

        for (let index = from; index <= to; index++) {
            values.push(this.species[index * TYPES.length + column]);
        }

        return values;
    }

    // Колонки кадра поверх общего буфера. Порядок продиктован выравниванием:
    // сначала четырёхбайтные id, потом двухбайтные координаты, потом байты.
    viewsAt(offset, count) {
        const buffer = this.payload.buffer;
        let at = offset;
        const block = (Type, width) => {
            const column = new Type(buffer, at, count);
            at += width * count;
            return column;
        };

        return {
            ids: block(Uint32Array, 4),
            xs: block(Int16Array, 2),
            ys: block(Int16Array, 2),
            radii: block(Uint8Array, 1),
            types: block(Uint8Array, 1),
            flags: block(Uint8Array, 1)
        };
    }

    // Кадр между двумя записанными: те, кто есть в обоих, ставятся по доле
    // пути от одного к другому.
    //
    // Без этого проигрывание истории показывает шесть картинок в секунду
    // против шестидесяти в живом режиме: кадр пишется раз в десять тиков,
    // и движение выглядит рваным, хотя считается всё быстро.
    //
    // Существа сопоставляются по id, а id в кадре идут по возрастанию —
    // мир добавляет их в конец, а удаление порядка не меняет. Поэтому
    // хватает одного прохода по двум спискам.
    tween(index, part) {
        const next = index + 1;
        if (part <= 0 || next >= this.length) {
            return this.at(index);
        }

        const a = this.at(index);
        const b = this.at(next);
        const out = this.scratchFor(a.count + b.count);
        let i = 0;
        let j = 0;
        let n = 0;

        const take = (from, k) => {
            out.ids[n] = from.ids[k];
            out.xs[n] = from.xs[k];
            out.ys[n] = from.ys[k];
            out.radii[n] = from.radii[k];
            out.types[n] = from.types[k];
            out.flags[n] = from.flags[k];
            n++;
        };

        while (i < a.count || j < b.count) {
            const left = i < a.count ? a.ids[i] : Infinity;
            const right = j < b.count ? b.ids[j] : Infinity;

            if (left === right) {
                take(a, i);
                out.xs[n - 1] = a.xs[i] + (b.xs[j] - a.xs[i]) * part;
                out.ys[n - 1] = a.ys[i] + (b.ys[j] - a.ys[i]) * part;
                // состояние берём более свежее: берсерк чернеет сразу
                out.flags[n - 1] = b.flags[j];
                i++;
                j++;
            } else if (left < right) {
                // существо съедено за эти тики — убираем на середине пути,
                // иначе оно доживало бы до следующего кадра целиком
                if (part < 0.5) {
                    take(a, i);
                }
                i++;
            } else {
                // появилось за эти тики — по той же причине показываем со второй половины
                if (part >= 0.5) {
                    take(b, j);
                }
                j++;
            }
        }

        out.count = n;
        return out;
    }

    // Буфер под промежуточный кадр. Он живёт от отрисовки до отрисовки,
    // поэтому переиспользуется, а не создаётся заново шестьдесят раз в секунду.
    scratchFor(size) {
        if (!this.scratch || this.scratch.ids.length < size) {
            this.scratch = {
                count: 0,
                ids: new Uint32Array(size * 2),
                xs: new Float32Array(size * 2),
                ys: new Float32Array(size * 2),
                radii: new Uint8Array(size * 2),
                types: new Uint8Array(size * 2),
                flags: new Uint8Array(size * 2)
            };
        }
        return this.scratch;
    }

    // Место под очередной кадр; буферы растут удвоением, чтобы не копировать
    // историю на каждой записи.
    //
    // Ёмкость каждой колонки проверяется своя. Раньше здесь стояла одна общая
    // проверка по ticks — а species вмещает в восемь раз меньше кадров, по
    // числу на вид. С сто двадцать восьмого кадра счётчики уходили за границу
    // массива: запись молча пропадала, чтение возвращало undefined, и график
    // получал NaN в координатах.
    reserve(index, size) {
        this.ticks = grow(this.ticks, index + 1);
        this.offsets = grow(this.offsets, index + 1);
        this.sizes = grow(this.sizes, index + 1);
        this.species = grow(this.species, (index + 1) * TYPES.length);
        this.payload = grow(this.payload, this.used + size);
    }
}

function writeFrameRow(columns, i, object) {
    columns.ids[i] = object.id;
    // для картинки хватает целых пикселей
    columns.xs[i] = Math.round(object.x);
    columns.ys[i] = Math.round(object.y);
    columns.radii[i] = Math.min(MAX_RADIUS, Math.round(object.radius));
    columns.types[i] = typeIndex(object.type);
    columns.flags[i] = object.frameFlags();
}

function grow(array, needed) {
    // reserve зовётся на каждом кадре, поэтому первым делом — дешёвый выход
    if (needed <= array.length) {
        return array;
    }

    // с нуля начинаем сразу с осмысленного размера, чтобы не переливать
    // буфер полтора десятка раз на первых кадрах
    let size = array.length || 1024;
    while (size < needed) {
        size *= 2;
    }

    const grown = new array.constructor(size);
    grown.set(array);
    return grown;
}
