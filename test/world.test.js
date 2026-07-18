import test from 'node:test';
import assert from 'node:assert/strict';

import { BERSERK_BIT, World } from '../src/core/world.js';
import { Base, Grass, Stone, Clip, Paper, createLifer, liferFieldGroups, liferTypes, typeByIndex } from '../src/core/lifers.js';

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
    assert.equal(typeByIndex(frame.types[0] & (BERSERK_BIT - 1)), 'Grass');
});

test('кадр истории занимает 6 байт на существо', () => {
    const world = new World(500, 500);
    world.populate('Stone', 50);
    world.populate('Clip', 50);

    world.update(0);

    assert.equal(world.history[0].bytes, 100 * 6);
    assert.equal(world.historyBytes, 100 * 6);
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
    assert.ok(frame.types[0] & BERSERK_BIT, 'старший бит помечает берсерка');
    assert.equal(typeByIndex(frame.types[0] & (BERSERK_BIT - 1)), 'Stone');
});

test('история не растёт бесконечно — старые кадры вытесняются', () => {
    const world = new World(500, 500);
    world.add(new Grass(10, 20));

    for (let i = 0; i < 6200; i++) {
        world.update(i);
    }

    assert.equal(world.history.length, 600);
    // остались последние кадры, а не первые
    assert.equal(world.history.at(-1).tick, 6190);
    assert.ok(world.history[0].tick > 0);
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

test('поля существа разложены по классам иерархии', () => {
    const groups = liferFieldGroups(new Stone(0, 0));

    assert.deepEqual(groups.map((group) => group.name), ['Base', 'Creature', 'Unit', 'Stone']);

    // каждое поле попадает ровно в одну группу, и вместе они покрывают объект
    const fields = groups.flatMap((group) => group.fields);
    assert.equal(new Set(fields).size, fields.length, 'поле не должно попасть в две группы');
    assert.deepEqual(fields.slice().sort(), Object.keys(new Stone(0, 0)).sort());
});

test('поле уходит классу, который задаёт ему значение последним', () => {
    const byName = (lifer) => new Map(liferFieldGroups(lifer).map((g) => [g.name, new Set(g.fields)]));

    const stone = byName(new Stone(0, 0));
    // Stone только переопределяет — если считать по появлению ключа,
    // его вкладка осталась бы пустой
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
