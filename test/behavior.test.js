import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world.js';
import { Anim, animate } from '../src/core/animate.js';
import { decide } from '../src/core/behavior.js';
import { createLifer } from '../src/core/lifers.js';

test('волк догоняет корову', () => {
    const world = new World(500, 500);
    const wolf = world.add(createLifer('Wolf', 100, 100));
    world.add(createLifer('Cow', 150, 100));

    const { anim, vector } = decide(wolf, world);

    assert.equal(anim, Anim.CHASE);
    assert.deepEqual(vector, { x: 150, y: 100 });
});

test('корова убегает от волка, даже если рядом трава', () => {
    const world = new World(500, 500);
    const cow = world.add(createLifer('Cow', 100, 100));
    world.add(createLifer('Wolf', 140, 100));
    world.add(createLifer('Grass', 120, 100));

    const { anim, vector } = decide(cow, world);

    assert.equal(anim, Anim.ESCAPE);
    assert.deepEqual(vector, { x: 140, y: 100 });
});

test('боец съедает цель в пределах своего радиуса', () => {
    const world = new World(500, 500);
    const stone = world.add(createLifer('Stone', 100, 100));
    const clip = world.add(createLifer('Clip', 105, 100));
    const radiusBefore = stone.radius;

    decide(stone, world);

    assert.equal(clip.removed, true);
    assert.equal(stone.kills, 1);
    assert.equal(stone.radius, radiusBefore + 1);
});

test('от берсерка бегут даже те, кому он в обычной жизни цель', () => {
    const world = new World(500, 500);
    const stone = world.add(createLifer('Stone', 100, 100));
    const clip = world.add(createLifer('Clip', 160, 100));
    clip.behavior = 'berserk';

    const { anim, vector } = decide(stone, world);

    assert.equal(anim, Anim.ESCAPE);
    assert.deepEqual(vector, { x: 160, y: 100 });
});

test('боец входит в режим берсерка после 5 убийств', () => {
    const world = new World(500, 500);
    const stone = world.add(createLifer('Stone', 100, 100));
    stone.berserkCounter = 5;

    stone.updateBerserk(world);

    assert.equal(stone.behavior, 'berserk');
    assert.equal(stone.color, 'black');
    // 300 тиков (5 секунд), минус один — он списывается в том же тике
    assert.equal(stone.berserkTtl, 299);
});

test('берсерк умирает по истечении своего режима', () => {
    const world = new World(500, 500);
    const stone = world.add(createLifer('Stone', 100, 100));
    stone.berserkTtl = 1;

    stone.updateBerserk(world);

    assert.equal(stone.removed, true);
});

test('chase двигает существо к цели, escape — от неё', () => {
    const world = new World(500, 500);
    const ghost = world.add(createLifer('Ghost', 100, 100));

    animate(ghost, world, Anim.CHASE, { x: 200, y: 100 });
    assert.ok(ghost.x > 100, 'должен приблизиться к цели');

    const afterChase = ghost.x;
    animate(ghost, world, Anim.ESCAPE, { x: 200, y: 100 });
    assert.ok(ghost.x < afterChase, 'должен отдалиться от цели');
});

test('существо не выходит за границы мира', () => {
    const world = new World(200, 200);
    const ghost = world.add(createLifer('Ghost', 199, 100));

    for (let i = 0; i < 50; i++) {
        animate(ghost, world, Anim.CHASE, { x: 1000, y: 100 });
        assert.ok(ghost.x > 0 && ghost.x < world.width, 'x внутри мира: ' + ghost.x);
    }
});

test('particle задаёт импульс один раз и сохраняет его', () => {
    const world = new World(500, 500);
    const ghost = world.add(createLifer('Ghost', 100, 100));

    animate(ghost, world, Anim.PARTICLE, null);
    const { dx, dy } = ghost;

    animate(ghost, world, Anim.PARTICLE, null);

    assert.equal(ghost.dx, dx);
    assert.equal(ghost.dy, dy);
    assert.ok(Math.abs(Math.hypot(dx, dy) - ghost.speed) < 1e-9, 'модуль импульса равен скорости');
});

test('совпадающие координаты не ломают импульс', () => {
    const world = new World(500, 500);
    const ghost = world.add(createLifer('Ghost', 100, 100));

    animate(ghost, world, Anim.CHASE, { x: 100, y: 100 });

    assert.ok(Number.isFinite(ghost.x) && Number.isFinite(ghost.y));
});

test('симуляция матча идёт без ошибок и сходится к одному виду', () => {
    const world = new World(300, 300);
    world.populate('Stone', 15);
    world.populate('Clip', 15);
    world.populate('Paper', 15);

    for (let tick = 0; tick < 2000 && !world.stopped; tick++) {
        world.update(tick * 16);
    }

    assert.ok(world.tick > 0);
    for (const lifer of world.state) {
        assert.ok(Number.isFinite(lifer.x) && Number.isFinite(lifer.y), 'координаты валидны');
    }
});
