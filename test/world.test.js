import test from 'node:test';
import assert from 'node:assert/strict';

import { World, storedRow, storedWorld } from '../src/core/world.js';
import { Base, Flag, Grass, Stone, Clip, Paper, createLifer, liferFieldTable, liferTypes, typeByIndex } from '../src/core/species.js';

// Существа пересматривают решение не каждый тик, а раз в несколько:
// иначе, оказавшись между двумя равными раздражителями, они дрожат.
// Поэтому проверки ждут события, а не привязываются к нулевому тику.
function until(world, done, limit = 30) {
    for (let i = 0; i < limit && !done(); i++) {
        world.update(i);
    }
    return done();
}

test('add назначает уникальные id', () => {
    const world = new World(100, 100);
    const a = world.add(new Grass(10, 10));
    const b = world.add(new Grass(20, 20));

    assert.notEqual(a.id, b.id);
    assert.equal(world.state.length, 2);
});

test('remove убирает существо и снимает выделение', () => {
    const world = new World(100, 100);
    const grass = world.add(new Grass(10, 10));
    world.select = grass;

    world.remove(grass);

    assert.equal(world.state.length, 0);
    assert.equal(world.select, null);
    assert.equal(grass.removed, true);
});

test('getNear возвращает соседей в радиусе обзора, кроме себя', () => {
    const world = new World(500, 500);
    const wolf = world.add(createLifer('Wolf', 100, 100));
    const near = world.add(new Grass(150, 100));
    world.add(new Grass(400, 400));

    const nears = world.getNear(wolf);

    assert.deepEqual(nears, [near]);
});

test('selectByLocation находит ближайшее существо и не портит его', () => {
    const world = new World(500, 500);
    world.add(new Grass(10, 10));
    const target = world.add(new Grass(100, 100));

    const selected = world.selectByLocation({ x: 105, y: 105 });

    assert.equal(selected, target);
    assert.equal(world.select, target);
    assert.equal('distance' in target, false);
});

test('history пишет кадр каждые 10 тиков', () => {
    const world = new World(500, 500);
    world.add(new Grass(10.5, 20.5));

    for (let i = 0; i < 11; i++) {
        world.update(i);
    }

    assert.deepEqual([world.history.tickAt(0), world.history.tickAt(1)], [0, 10]);
    assert.equal(world.history.length, 2);

    const frame = world.history.at(0);
    assert.equal(frame.count, 1);
    assert.equal(frame.xs[0], 11); // координаты округляются до пикселей
    assert.equal(frame.ys[0], 21);
    assert.equal(frame.radii[0], 8);
    assert.equal(typeByIndex(frame.types[0]), 'Grass');
    assert.equal(frame.flags[0], 0);
});

test('кадр картинки занимает 11 байт на существо, полный слепок — 72', () => {
    const world = new World(500, 500);
    world.populate('Stone', 50);
    world.populate('Clip', 50);

    for (let tick = 0; tick < 30; tick++) {
        world.update(tick);
    }

    // координаты, радиус, вид, флаги и id — последний нужен, чтобы сшивать
    // соседние кадры при отрисовке промежуточных
    assert.equal(world.history.used, 3 * 100 * 11, 'три кадра по одиннадцать байт');

    // слепку нужно всё изменяемое состояние, и дробное — в двойной точности
    assert.equal(world.keyframes[0].bytes, 100 * 72);
});

test('накладные расходы кадра не зависят от населения', () => {
    // Кадры лежат в общих колонках, а не отдельными объектами: раньше кадр
    // с одним существом стоил те же ~1300 байт, что и кадр с тремя сотнями,
    // и пустой мир копил мегабайты, показывая нулевой размер.
    const busy = new World(500, 500);
    busy.populate('Grass', 300);

    const empty = new World(500, 500);
    empty.populate('Grass', 1);

    for (let tick = 0; tick < 1000; tick++) {
        busy.update(tick);
        empty.update(tick);
    }

    assert.equal(busy.history.length, empty.history.length);
    assert.equal(busy.history.used, 100 * 300 * 11);
    assert.equal(empty.history.used, 100 * 12, 'кадр округляется до кратного четырём');
});

test('в кадр попадают только живые существа', () => {
    const world = new World(500, 500);
    const stone = world.add(new Stone(100, 100));
    world.add(new Clip(105, 100)); // окажется съеден, как только камень решится
    world.add(new Paper(400, 400));

    until(world, () => stone.kills > 0);
    // доводим до следующего кадра картинки: они пишутся раз в десять тиков
    for (let i = 0; i < 10; i++) {
        world.update(i);
    }

    const frame = world.history.at(world.history.length - 1);

    assert.equal(stone.kills, 1);
    assert.equal(frame.count, 2);
    assert.equal(frame.count, world.state.length);
});

test('в кадре истории сохраняются счётчики того момента', () => {
    const world = new World(500, 500);
    world.populate('Stone', 3);
    world.populate('Clip', 2);

    world.update(0);
    world.remove(world.state[0]);
    for (let i = 1; i <= 10; i++) {
        world.update(i);
    }

    assert.deepEqual(world.history.countsAt(0), { Stone: 3, Clip: 2 });
    // второй кадр уже без съеденного — график по истории покажет именно это
    assert.notDeepEqual(world.history.countsAt(1), world.history.countsAt(0));
});

test('в кадре истории видно, что боец в режиме берсерка', () => {
    const world = new World(500, 500);
    const stone = world.add(new Stone(30, 40));
    world.add(new Clip(480, 480)); // второй вид, иначе матч кончится на первом тике
    stone.berserkCounter = 5;

    world.update(0);

    const frame = world.history.at(0);
    assert.ok(frame.flags[0] & Flag.BERSERK, 'флаг помечает берсерка');
    // вид в кадре остаётся видом — состояние его не подменяет
    assert.equal(typeByIndex(frame.types[0]), 'Stone');
});

test('берсерк остаётся бойцом своего вида и не заканчивает матч', () => {
    const world = new World(500, 500);
    const stone = world.add(new Stone(30, 40));
    world.add(new Clip(480, 480));
    stone.berserkCounter = 5;
    world.onFinish = () => assert.fail('матч не окончен: бойцов всё ещё два вида');

    world.update(0);

    assert.equal(stone.state, 'berserk');
    assert.equal(stone.behavior, 'compete', 'роль вида берсерком не затирается');
    assert.equal(world.competitorTypes, 2);
});

test('при перемотке клик выбирает того, кто был там тогда, а не живого', () => {
    const world = new World(500, 500, 1);
    const drifter = world.add(new Grass(100, 100));
    const other = world.add(new Grass(150, 150));

    world.update(0);

    // существо уехало: на канвасе прошлое, живое стоит уже не там
    drifter.x = 450;
    drifter.y = 450;

    // целимся туда, где оно было в тот момент
    assert.equal(world.selectByLocationAt(0, { x: 100, y: 100 }).id, drifter.id);
    assert.equal(world.selectId, drifter.id);

    // а по живым координатам в той же точке ближе всех оказался бы other
    assert.equal(world.selectByLocation({ x: 100, y: 100 }), other);
});

test('съеденное существо всё равно выделяется в своём моменте', () => {
    const world = new World(500, 500, 1);
    const doomed = world.add(new Grass(100, 100));
    world.add(new Grass(400, 400));

    world.update(0);
    world.remove(doomed);

    // в живом мире его уже нет
    assert.equal(world.selectByLocation({ x: 100, y: 100 }).id !== doomed.id, true);

    // а в показанном моменте оно ещё живо, и клик попадает именно в него
    assert.equal(world.selectByLocationAt(0, { x: 100, y: 100 }).id, doomed.id);
    assert.equal(world.select, null, 'живого объекта под выделением нет');
    assert.equal(world.selectionAt(0).id, doomed.id, 'но в том моменте есть');
});

test('выделение — это id, а живой объект лишь его разрешение', () => {
    const world = new World(500, 500);
    const grass = world.add(new Grass(10, 10));

    world.select = grass;
    assert.equal(world.select, grass);
    assert.equal(world.selectId, grass.id);

    world.remove(grass);

    // объекта больше нет, но выделение помнит, кого выбрали
    assert.equal(world.select, null);
    assert.equal(world.selectId, grass.id);
});

test('поля выделенного берутся из показанного момента, а не из «сейчас»', () => {
    const world = new World(500, 500, 9);
    const cow = world.add(createLifer('Cow', 100, 100));
    world.add(new Grass(105, 100));

    world.update(0);
    const early = { energy: cow.energy, ttl: cow.ttl, x: cow.x };

    for (let tick = 1; tick < 300; tick++) {
        world.update(tick * 16);
    }
    world.select = cow;

    const past = world.selectionAt(0);

    assert.equal(past.energy, early.energy, 'запас сил того момента');
    assert.equal(past.ttl, early.ttl, 'и остаток жизни тоже');
    assert.equal(past.x, early.x);
    assert.notEqual(cow.ttl, early.ttl, 'а сейчас существо уже прожило дольше');
});

test('песочница не объявляет победу и не останавливает время', () => {
    const world = new World(500, 500);
    world.matchEnds = false;
    world.add(new Stone(10, 10));
    world.onFinish = () => assert.fail('в песочнице матча нет');

    world.update(0);

    // одинокий боец иначе тут же оказался бы единственным видом
    assert.equal(world.competitorTypes, 1);
    assert.equal(world.stopped, false, 'время должно идти дальше');
});

test('история хранится целиком, с самого первого кадра', () => {
    const world = new World(500, 500);
    world.add(new Grass(10, 20));

    for (let i = 0; i < 6200; i++) {
        world.update(i);
    }

    // кадр каждые 10 тиков, ничего не вытесняется
    assert.equal(world.history.length, 620);
    assert.equal(world.history.tickAt(0), 0, 'самый первый кадр на месте');
    assert.equal(world.history.tickAt(619), 6190);
});

test('historyBytes считает и кадры картинки, и ключевые кадры', () => {
    const world = new World(500, 500);
    world.populate('Stone', 10);
    world.populate('Clip', 10);

    for (let i = 0; i < 100; i++) {
        world.update(i);
    }

    const keyframes = world.keyframes.reduce((total, frame) => total + frame.bytes, 0);
    assert.equal(world.historyBytes, world.history.bytes + keyframes);
    // счёт идёт по буферам, а не по полезным байтам: занижать расход
    // в сотни раз хуже, чем показывать выделенный, но пока пустой хвост
    assert.ok(world.history.bytes >= world.history.used);
});

test('существо исчезает, когда заканчивается ttl', () => {
    const world = new World(500, 500);
    const cow = world.add(createLifer('Cow', 10, 10));
    cow.ttl = 3;

    for (let i = 0; i < 3; i++) {
        world.update(i);
    }

    assert.equal(world.hasLife(), false);
});

test('неподвижное существо не стареет — его только съедают', () => {
    const world = new World(500, 500);
    const grass = world.add(new Grass(10, 10));

    // возраст появляется у Creature вместе с движением: трава от старости
    // не гибнет ни в одном сценарии, её всегда съедают раньше
    assert.equal(grass.ttl, undefined);
    assert.equal('ttl' in grass, false);

    for (let i = 0; i < 500; i++) {
        world.update(i);
    }

    assert.equal(world.hasLife(), true, 'трава пережила пятьсот тиков');
});

test('счётчики видов пересчитываются на каждом тике', () => {
    const world = new World(500, 500);
    world.populate('Stone', 3);
    world.populate('Clip', 2);

    world.update(0);

    assert.deepEqual(world.getCounts(), { Stone: 3, Clip: 2 });
    assert.equal(world.totalTypes, 2);
    assert.equal(world.maxCounts(), 3);
});

test('матч останавливается, когда остаётся один вид бойцов', () => {
    const world = new World(500, 500);
    world.add(new Stone(10, 10));
    let winner = null;
    world.onFinish = (name) => { winner = name; };

    world.update(0);

    assert.equal(winner, 'Stone');
    assert.equal(world.stopped, true);
});

test('матч завершается, пока трава и коровы ещё живы', () => {
    const world = new World(500, 500);
    world.add(new Stone(10, 10));
    world.add(new Grass(400, 400));
    world.add(createLifer('Cow', 450, 450));
    let winner = null;
    world.onFinish = (name) => { winner = name; };

    world.update(0);

    assert.equal(world.totalTypes, 3, 'видов в мире три');
    assert.equal(world.competitorTypes, 1, 'а бойцов — один');
    assert.equal(winner, 'Stone');
});

test('эндшпиль не включается на паре «боец + не боец»', () => {
    const world = new World(500, 500);
    const stone = world.add(new Stone(100, 100));
    const grass = world.add(new Grass(105, 100));

    world.update(0);

    // трава — не соперник: её нельзя съесть по правилам матча
    assert.equal(world.competitorTypes, 1);
    assert.equal(grass.removed, false, 'боец не должен есть траву');
    assert.equal(stone.kills, 0);
});

test('подсев добавляет существ с заданной вероятностью', () => {
    const world = new World(500, 500);
    world.setSpawnRate('Grass', 1);

    world.update(0);
    world.update(16);

    assert.equal(world.getCounts().Grass, 2);

    world.setSpawnRate('Grass', 0);
    world.update(32);

    assert.equal(world.getCounts().Grass, 2, 'нулевая вероятность отключает подсев');
});

test('мир из одной травы не считается победой', () => {
    const world = new World(500, 500);
    world.add(new Grass(10, 10));
    world.onFinish = () => assert.fail('трава не участвует в матче');

    world.update(0);

    assert.equal(world.stopped, false);
});

test('createLifer знает все модели из реестра', () => {
    for (const type of liferTypes()) {
        const lifer = createLifer(type, 1, 2);
        assert.equal(lifer.type, type);
        assert.equal(lifer.x, 1);
    }

    assert.throws(() => createLifer('Dragon', 0, 0), /Unknown lifer/);
});

test('камень-ножницы-бумага: цикл danger/target замкнут', () => {
    const stone = new Stone(0, 0);
    const clip = new Clip(0, 0);
    const paper = new Paper(0, 0);

    assert.equal(stone.target, clip.type);
    assert.equal(clip.target, paper.type);
    assert.equal(paper.target, stone.type);

    assert.equal(stone.danger, paper.type);
    assert.equal(clip.danger, stone.type);
    assert.equal(paper.danger, clip.type);
});

test('значения вида лежат на прототипе, а не в каждой особи', () => {
    const stone = new Stone(0, 0);

    // особь хранит только то, что у неё меняется
    assert.deepEqual(Object.keys(stone).sort(),
        ['berserkCounter', 'berserkTtl', 'dx', 'dy', 'energy', 'fed', 'id', 'kills', 'removed', 'state', 'x', 'y'].sort());

    assert.equal(stone.color, 'orange', 'а вид читается через прототип');
    assert.equal(Object.hasOwn(stone, 'color'), false);
});

test('изменение величины у особи не трогает её вид', () => {
    const grown = new Stone(0, 0);
    grown.radius += 5;

    assert.equal(grown.radius, 15);
    assert.equal(new Stone(0, 0).radius, 10, 'соседний камень остался прежним');
    assert.equal(Stone.prototype.radius, 10, 'и описание вида тоже');
});

test('травоядное ест, не заводя счётчиков бойца', () => {
    const world = new World(500, 500);
    const cow = world.add(createLifer('Cow', 100, 100));
    const grass = world.add(new Grass(102, 100));

    until(world, () => grass.removed);

    assert.equal(grass.removed, true);
    assert.equal(cow.kills, undefined, 'счётчики убийств — дело только бойцов');
});

test('обессиленное существо движется вполсилы', () => {
    const ghost = createLifer('Ghost', 100, 100);

    assert.equal(ghost.pace, ghost.speed, 'при полном запасе — скорость вида');

    ghost.energy = 0;
    assert.equal(ghost.pace, ghost.speed * 0.5);

    // множитель, а не остановка: обессиленный всё же ползёт
    assert.ok(ghost.pace > 0);
});

test('добыча возвращает силы, но не выше предела вида', () => {
    const world = new World(500, 500);
    const cow = world.add(createLifer('Cow', 100, 100));
    const grass = world.add(new Grass(200, 200));
    cow.energy = 10;

    cow.eat(world, grass);

    assert.equal(grass.removed, true);
    assert.equal(cow.energy, 10 + grass.radius * 20, 'сытность соразмерна размеру добычи');

    // до отвала: остаток корма пропадает, впрок его не запасёшь
    cow.energy = cow.energyMax - 1;
    cow.eat(world, new Grass(0, 0));

    assert.equal(cow.energy, cow.energyMax, 'выше предела вида запас не растёт');
});

test('запас сил не уходит в минус', () => {
    const wolf = createLifer('Wolf', 100, 100);
    wolf.energy = 0;

    for (let i = 0; i < 100; i++) {
        wolf.spend('chase');
    }

    assert.equal(wolf.energy, 0);
});

test('берсерк выжигает запас быстрее обычного бойца', () => {
    const calm = createLifer('Stone', 100, 100);
    const berserk = createLifer('Stone', 100, 100);
    // берсерк отличается от бойца полуторной скоростью — за неё он и платит
    berserk.speed *= 1.5;

    calm.spend('chase');
    berserk.spend('chase');

    const spent = (lifer) => lifer.energyMax - lifer.energy;
    assert.ok(spent(berserk) > spent(calm) * 1.4, 'скорость дорожает вместе с расходом');
});

test('неподвижному существу силы не нужны', () => {
    const grass = new Grass(10, 10);

    // энергия — механика движения, у травы её нет вовсе
    assert.equal(grass.energy, undefined);
    assert.equal('energy' in grass, false);
});

test('поля разложены таблицей: колонки классы, строки поля', () => {
    const stone = new Stone(0, 0);
    const table = liferFieldTable(stone);

    assert.deepEqual(table.classes, ['Base', 'Creature', 'Unit', 'Stone']);

    const byField = new Map(table.rows.map((row) => [row.field, row.cells]));
    const declaring = (field) => byField.get(field)
        .map((cell, index) => (cell === null ? null : table.classes[index]))
        .filter(Boolean);

    // color объявлен дважды: Base задал чёрный, Stone переопределил
    assert.deepEqual(declaring('color'), ['Base', 'Stone']);
    assert.equal(byField.get('color')[0].value, 'black', 'у Base — то, что задавал он сам');
    assert.equal(byField.get('color')[3].value, 'orange', 'у Stone — нынешнее значение особи');

    // поле одного класса: у остальных ячейки пусты — там оно унаследовано
    assert.deepEqual(declaring('kills'), ['Unit']);
    assert.deepEqual(declaring('x'), ['Base']);
    assert.deepEqual(declaring('speed'), ['Creature']);
});

test('в таблице у каждого поля есть хотя бы один объявивший класс', () => {
    const table = liferFieldTable(new Stone(0, 0));

    for (const row of table.rows) {
        assert.equal(row.cells.length, table.classes.length, row.field);
        assert.ok(row.cells.some((cell) => cell !== null), 'поле ' + row.field);
    }

    // у неподвижной травы промежуточных классов нет
    assert.deepEqual(liferFieldTable(new Grass(0, 0)).classes, ['Base', 'Grass']);
});

test('нынешнее значение особи важнее того, что задавал вид', () => {
    const stone = new Stone(0, 0);
    stone.radius += 5;

    const byField = new Map(liferFieldTable(stone).rows.map((row) => [row.field, row.cells]));

    // radius объявлен Base и переопределён Unit: у Unit — выросшее значение
    assert.equal(byField.get('radius')[0].value, 8, 'Base задавал восемь');
    assert.equal(byField.get('radius')[2].value, 15, 'а особь отрастила пятнадцать');
});

test('погоня тратит силы, а дрейф их возвращает', () => {
    const world = new World(500, 500);
    const wolf = world.add(createLifer('Wolf', 100, 100));
    const cow = world.add(createLifer('Cow', 160, 100));

    // решение пересматривается не каждый тик, поэтому даём существу
    // дожить до своего момента
    until(world, () => wolf.energy < wolf.energyMax);
    const afterChase = wolf.energy;
    assert.ok(afterChase < wolf.energyMax, 'погоня стоит сил');

    // корова с глаз долой — волку некого догонять, он дрейфует и отдыхает
    world.remove(cow);
    until(world, () => wolf.energy > afterChase);

    assert.ok(wolf.energy > afterChase, 'в покое силы возвращаются');
});

test('обессиленное существо движется вполсилы', () => {
    const ghost = createLifer('Ghost', 100, 100);

    assert.equal(ghost.pace, ghost.speed, 'при полном запасе — скорость вида');

    ghost.energy = 0;
    assert.equal(ghost.pace, ghost.speed * 0.5);

    // множитель, а не остановка: обессиленный всё же ползёт
    assert.ok(ghost.pace > 0);
});

test('добыча возвращает силы, но не выше предела вида', () => {
    const world = new World(500, 500);
    const cow = world.add(createLifer('Cow', 100, 100));
    const grass = world.add(new Grass(200, 200));
    cow.energy = 10;

    cow.eat(world, grass);

    assert.equal(grass.removed, true);
    assert.equal(cow.energy, 10 + grass.radius * 20, 'сытность соразмерна размеру добычи');

    // до отвала: остаток корма пропадает, впрок его не запасёшь
    cow.energy = cow.energyMax - 1;
    cow.eat(world, new Grass(0, 0));

    assert.equal(cow.energy, cow.energyMax, 'выше предела вида запас не растёт');
});

test('запас сил не уходит в минус', () => {
    const wolf = createLifer('Wolf', 100, 100);
    wolf.energy = 0;

    for (let i = 0; i < 100; i++) {
        wolf.spend('chase');
    }

    assert.equal(wolf.energy, 0);
});

test('берсерк выжигает запас быстрее обычного бойца', () => {
    const calm = createLifer('Stone', 100, 100);
    const berserk = createLifer('Stone', 100, 100);
    // берсерк отличается от бойца полуторной скоростью — за неё он и платит
    berserk.speed *= 1.5;

    calm.spend('chase');
    berserk.spend('chase');

    const spent = (lifer) => lifer.energyMax - lifer.energy;
    assert.ok(spent(berserk) > spent(calm) * 1.4, 'скорость дорожает вместе с расходом');
});

test('неподвижному существу силы не нужны', () => {
    const grass = new Grass(10, 10);

    // энергия — механика движения, у травы её нет вовсе
    assert.equal(grass.energy, undefined);
    assert.equal('energy' in grass, false);
});


test('дебаг читает строку прямо из буфера ключевого кадра', () => {
    const world = new World(500, 500, 1);
    world.matchEnds = false;
    const stone = world.place('Stone', 100.7, 50.2);
    stone.radius += 3;
    stone.kills = 7;

    world.update(0);

    const stored = new Map(storedRow(world.keyframes[0], stone.id)
        .map((field) => [field.name, field]));

    // координаты в слепке точны до последнего бита — на них держится повтор
    assert.equal(stored.get('x').value, 100.7);
    assert.equal(stored.get('x').type, 'Float64');
    assert.equal(stored.get('radius').value, 13);
    assert.equal(stored.get('kills').value, 7);
    assert.equal(typeByIndex(stored.get('type').value), 'Stone');
});

test('в кадре, где существа нет, строки тоже нет', () => {
    const world = new World(500, 500, 1);
    world.matchEnds = false;
    world.place('Grass', 10, 10);

    for (let tick = 0; tick < 400; tick++) {
        world.update(tick);
    }
    // подселён после первого ключевого кадра
    const late = world.place('Stone', 200, 200);

    assert.equal(storedRow(world.keyframes[0], late.id), null);
    assert.ok(storedRow(world.keyframes[0], 1), 'а тот, кто был, находится');
});

test('поля, которых у вида нет, записываются нулями', () => {
    const world = new World(500, 500, 1);
    world.matchEnds = false;
    const grass = world.place('Grass', 10, 10);

    world.update(0);
    const stored = new Map(storedRow(world.keyframes[0], grass.id)
        .map((field) => [field.name, field]));

    // у травы нет ни скорости, ни запаса сил, ни счётчиков бойца —
    // в слепке на их месте нули, и дебаг обязан показывать именно их
    assert.equal(grass.speed, undefined);
    assert.equal(grass.energy, undefined);
    assert.equal(stored.get('speed').value, 0);
    assert.equal(stored.get('energy').value, 0);
    assert.equal(stored.get('kills').value, 0);
});

test('берсерк в слепке — единица, а не строка', () => {
    const world = new World(500, 500, 1);
    world.matchEnds = false;
    const stone = world.place('Stone', 100, 100);
    // ключевой кадр снимается до хода тика, поэтому режим включаем заранее
    stone.state = 'berserk';

    world.update(0);

    const stored = new Map(storedRow(world.keyframes[0], stone.id)
        .map((field) => [field.name, field]));

    assert.equal(stored.get('state').value, 1);
    assert.equal(stored.get('state').type, 'Uint8');
});

test('ключевой кадр снимается до хода тика, кадр картинки — после', () => {
    const world = new World(500, 500, 1);
    world.matchEnds = false;
    const stone = world.place('Stone', 100, 100);
    const startX = stone.x;

    world.update(0);

    // слепок — состояние на начало тика: с него прогон и начинается
    const stored = storedRow(world.keyframes[0], stone.id)
        .find((field) => field.name === 'x');
    assert.equal(stored.value, startX);

    // кадр картинки — уже после движения
    assert.equal(world.history.at(0).xs[0], Math.round(stone.x));
    assert.notEqual(Math.round(stone.x), Math.round(startX));
});

test('слепок хранит и состояние самого мира, а не только существ', () => {
    const world = new World(500, 500, 42);
    world.populate('Grass', 5);
    world.setSpawnRate('Grass', 0.5);

    world.update(0);

    const stored = new Map(storedWorld(world.keyframes[0])
        .map((field) => [field.name, field.value]));

    // без этого прогон с кадра пошёл бы по другой случайности
    assert.equal(stored.get('tick'), 0);
    assert.equal(stored.get('count'), 5);
    assert.equal(stored.get('nextId'), 6);
    assert.equal(typeof stored.get('randomState'), 'number');
    assert.equal(stored.get('spawns'), 'Grass:0.5');
});

test('колонки истории растут каждая по своей ёмкости', () => {
    const world = new World(500, 500, 4);
    world.populate('Grass', 5);
    world.populate('Cow', 3);

    // 200 кадров — заведомо больше, чем вмещала колонка счётчиков по видам:
    // она хранит по числу на вид, то есть кончается в восемь раз раньше,
    // чем колонка тиков. Общая проверка ёмкости по ticks её не спасала,
    // счётчики уходили за границу массива и молча терялись
    for (let tick = 0; tick < 2000; tick++) {
        world.update(tick);
    }

    assert.equal(world.history.length, 200);

    for (const index of [0, 127, 128, 199]) {
        const counts = world.history.countsAt(index);
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

        assert.equal(total, world.history.at(index).count, 'кадр ' + index);
        assert.ok(Number.isFinite(world.history.seriesOf('Cow', index, index)[0]),
            'ряд графика без дыр на кадре ' + index);
    }
});

test('промежуточный кадр ставит существо между записанными', () => {
    const world = new World(500, 500, 2);
    world.matchEnds = false;
    const stone = world.add(new Stone(100, 100));

    for (let tick = 0; tick < 30; tick++) {
        world.update(tick);
    }

    const a = world.history.at(0);
    const b = world.history.at(1);
    assert.notEqual(a.xs[0], b.xs[0], 'за десять тиков существо сдвинулось');

    const middle = world.history.tween(0, 0.5);

    assert.equal(middle.count, 1);
    assert.equal(middle.ids[0], stone.id);
    assert.ok(Math.abs(middle.xs[0] - (a.xs[0] + b.xs[0]) / 2) < 1e-3, 'ровно посередине');

    // нулевая доля — это сам записанный кадр, без домысливания
    assert.equal(world.history.tween(0, 0).xs[0], a.xs[0]);
});

test('промежуточный кадр сшивает соседние по id, а не по порядку', () => {
    const world = new World(500, 500, 6);
    world.matchEnds = false;
    world.populate('Grass', 20);

    for (let tick = 0; tick < 30; tick++) {
        world.update(tick);
    }
    // убираем существо из середины: индексы сдвинутся, id — нет
    const doomed = world.state[5];
    world.remove(doomed);
    for (let tick = 30; tick < 40; tick++) {
        world.update(tick);
    }

    const before = world.history.at(2);
    const after = world.history.at(3);
    assert.equal(after.count, before.count - 1);

    // на первой половине пути съеденное ещё видно, на второй уже нет
    assert.ok([...world.history.tween(2, 0.2).ids].includes(doomed.id));
    assert.ok(![...world.history.tween(2, 0.8).ids].slice(0, after.count).includes(doomed.id));

    // остальные при этом не перепутаны местами
    const middle = world.history.tween(2, 0.5);
    const ids = [...middle.ids].slice(0, middle.count);
    assert.deepEqual(ids, [...ids].sort((x, y) => x - y), 'id идут по возрастанию');
});
