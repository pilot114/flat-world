import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world.js';
import { Base, Flag, Grass, Stone, Clip, Paper, createLifer, liferFieldGroups, liferTypes, typeByIndex } from '../src/core/species.js';

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

    assert.deepEqual(world.history.map((frame) => frame.tick), [0, 10]);

    const frame = world.history[0];
    assert.equal(frame.count, 1);
    assert.equal(frame.xs[0], 11); // координаты округляются до пикселей
    assert.equal(frame.ys[0], 21);
    assert.equal(frame.radii[0], 8);
    assert.equal(typeByIndex(frame.types[0]), 'Grass');
    assert.equal(frame.flags[0], 0);
});

test('кадр истории занимает 11 байт на существо', () => {
    const world = new World(500, 500);
    world.populate('Stone', 50);
    world.populate('Clip', 50);

    world.update(0);

    // 2+2 координаты, радиус, вид, флаги и 4 байта id
    assert.equal(world.history[0].bytes, 100 * 11);
    assert.equal(world.historyBytes, 100 * 11);
});

test('в кадр попадают только живые существа', () => {
    const world = new World(500, 500);
    const stone = world.add(new Stone(100, 100));
    world.add(new Clip(105, 100)); // окажется съеден на первом же тике
    world.add(new Paper(400, 400));

    world.update(0);

    assert.equal(stone.kills, 1);
    assert.equal(world.history[0].count, 2);
    assert.equal(world.history[0].count, world.state.length);
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

    assert.deepEqual(world.history[0].counts, { Stone: 3, Clip: 2 });
    // второй кадр уже без съеденного — график по истории покажет именно это
    assert.notDeepEqual(world.history[1].counts, world.history[0].counts);
});

test('в кадре истории видно, что боец в режиме берсерка', () => {
    const world = new World(500, 500);
    const stone = world.add(new Stone(30, 40));
    world.add(new Clip(480, 480)); // второй вид, иначе матч кончится на первом тике
    stone.berserkCounter = 5;

    world.update(0);

    const frame = world.history[0];
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

test('при перемотке клик выбирает то, что видно в кадре, а не живое', () => {
    const world = new World(500, 500);
    const drifter = world.add(new Grass(100, 100));
    const other = world.add(new Grass(150, 150));

    world.update(0);
    const frame = world.history[0];

    // существо уехало: на канвасе кадр из прошлого, живое стоит уже не там
    drifter.x = 450;
    drifter.y = 450;

    // целимся туда, где оно нарисовано в кадре
    assert.equal(world.selectByFrameLocation(frame, { x: 100, y: 100 }), drifter);

    // а по живым координатам в той же точке нет никого — старый код
    // выделил бы здесь other, оказавшегося ближе всех
    assert.equal(world.selectByLocation({ x: 100, y: 100 }), other);
});

test('съеденное существо из кадра всё равно выделяется', () => {
    const world = new World(500, 500);
    const doomed = world.add(new Grass(100, 100));
    world.add(new Grass(400, 400));

    world.update(0);
    const frame = world.history[0];
    world.remove(doomed);

    // живого объекта нет — панели полей взять неоткуда
    assert.equal(world.selectByFrameLocation(frame, { x: 100, y: 100 }), null);

    // но выделение состоялось: в кадре его есть чем пометить
    assert.equal(world.selectId, doomed.id);
    assert.equal(world.selectionInFrame(frame).id, doomed.id);
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

test('кадр хранит id — по нему точка связывается с живым существом', () => {
    const world = new World(500, 500);
    const grass = world.add(new Grass(10, 20));

    world.update(0);

    assert.equal(world.history[0].ids[0], grass.id);
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
    assert.equal(world.history[0].tick, 0, 'самый первый кадр на месте');
    assert.equal(world.history.at(-1).tick, 6190);
});

test('historyBytes считает всю историю, а не окно', () => {
    const world = new World(500, 500);
    world.populate('Stone', 10);

    for (let i = 0; i < 100; i++) {
        world.update(i);
    }

    const total = world.history.reduce((sum, frame) => sum + frame.bytes, 0);
    assert.equal(world.historyBytes, total);
});

test('существо исчезает, когда заканчивается ttl', () => {
    const world = new World(500, 500);
    const base = world.add(new Base(10, 10));
    base.ttl = 3;

    for (let i = 0; i < 3; i++) {
        world.update(i);
    }

    assert.equal(world.hasLife(), false);
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
        ['berserkCounter', 'berserkTtl', 'dx', 'dy', 'energy', 'id', 'kills', 'removed', 'state', 'x', 'y'].sort());

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

    world.update(0);

    assert.equal(grass.removed, true);
    assert.equal(cow.kills, undefined, 'счётчики убийств — дело только бойцов');
});

test('погоня тратит силы, а дрейф их возвращает', () => {
    const world = new World(500, 500);
    const wolf = world.add(createLifer('Wolf', 100, 100));
    world.add(createLifer('Cow', 160, 100));

    world.update(0);
    const afterChase = wolf.energy;
    assert.ok(afterChase < wolf.energyMax, 'погоня стоит сил');

    // корова с глаз долой — волку некого догонять, он дрейфует и отдыхает
    world.remove(world.state[1]);
    world.update(1);

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

test('поля существа разложены по классам иерархии', () => {
    const stone = new Stone(0, 0);
    const groups = liferFieldGroups(stone);

    assert.deepEqual(groups.map((group) => group.name), ['Base', 'Creature', 'Unit', 'Stone']);

    // каждое поле попадает ровно в одну группу
    const fields = groups.flatMap((group) => group.fields);
    assert.equal(new Set(fields).size, fields.length, 'поле не должно попасть в две группы');

    // вместе группы покрывают и поля особи, и значения её вида
    for (const own of Object.keys(stone)) {
        assert.ok(fields.includes(own), 'поле особи должно попасть в группу: ' + own);
    }
    for (const field of fields) {
        assert.notEqual(stone[field], undefined, 'поле группы должно читаться у особи: ' + field);
    }
    assert.ok(fields.includes('color'), 'значения вида тоже разложены по группам');
});

test('поле уходит самому конкретному классу из объявивших его', () => {
    const byName = (lifer) => new Map(liferFieldGroups(lifer).map((g) => [g.name, new Set(g.fields)]));

    const stone = byName(new Stone(0, 0));
    // Stone не заводит своих полей, а только переопределяет значения вида —
    // считать по появлению ключа значило бы оставить его вкладку пустой
    assert.ok(stone.get('Stone').has('color'), 'свой цвет — у Stone');
    assert.ok(stone.get('Stone').has('danger'), 'своя угроза — у Stone');
    assert.ok(stone.get('Unit').has('kills'), 'счётчик убийств — у Unit');
    assert.ok(stone.get('Creature').has('speed'), 'скорость — у Creature');
    assert.ok(stone.get('Base').has('x'), 'координаты — у Base');

    // у неподвижной травы нет промежуточных классов
    assert.deepEqual([...byName(new Grass(0, 0)).keys()], ['Base', 'Grass']);
});

test('группы полей одинаковы для существ одного класса', () => {
    // разбор кэшируется по классу: панель зовёт его на каждом кадре
    assert.equal(liferFieldGroups(new Stone(0, 0)), liferFieldGroups(new Stone(5, 5)));
    assert.notEqual(liferFieldGroups(new Stone(0, 0)), liferFieldGroups(new Clip(0, 0)));
});
