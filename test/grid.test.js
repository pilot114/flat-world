import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world.js';
import { SpatialGrid } from '../src/core/grid.js';
import { createLifer } from '../src/core/species.js';

// Эталон: поиск соседей полным перебором — сетка обязана совпадать с ним.
function naiveNear(world, lifer) {
    const radiusSquared = lifer.radiusView * lifer.radiusView;
    return world.state.filter((object) => {
        if (object === lifer) {
            return false;
        }
        const dx = object.x - lifer.x;
        const dy = object.y - lifer.y;
        return dx * dx + dy * dy < radiusSquared;
    });
}

const ids = (arr) => new Set(arr.map((o) => o.id));

function assertSameNears(world, lifer, message) {
    assert.deepEqual(ids(world.getNear(lifer)), ids(naiveNear(world, lifer)), message);
}

function populatedWorld(per = 60) {
    const world = new World(1000, 500, 1);
    world.populate('Stone', per);
    world.populate('Clip', per);
    world.populate('Paper', per);
    world.refreshCounts();
    return world;
}

test('сетка находит тех же соседей, что и полный перебор', () => {
    const world = populatedWorld();

    for (const lifer of world.state) {
        assertSameNears(world, lifer);
    }
});

test('сетка остаётся верной на протяжении симуляции', () => {
    const world = populatedWorld();

    for (let tick = 0; tick < 60; tick++) {
        world.update(tick * 16);

        for (const lifer of world.state) {
            assertSameNears(world, lifer, 'тик ' + tick);
        }
    }
});

test('сетка верна при любом радиусе обзора, включая нулевой и огромный', () => {
    const world = populatedWorld(20);
    const lifer = world.state[0];

    for (const radius of [0, 1, 49, 50, 51, 100, 300, 5000]) {
        lifer.radiusView = radius;
        assertSameNears(world, lifer, 'радиус ' + radius);
    }
});

test('сетка верна для существа на границе мира', () => {
    const world = populatedWorld(20);
    const lifer = world.state[0];

    for (const [x, y] of [[0, 0], [1000, 500], [0, 500], [1000, 0], [999.99, 0.01]]) {
        lifer.x = x;
        lifer.y = y;
        world.grid.rebuild(world.state);
        assertSameNears(world, lifer, `точка ${x},${y}`);
    }
});

test('удалённое существо сразу пропадает из соседей', () => {
    const world = new World(500, 500, 1);
    const hunter = world.add(createLifer('Stone', 100, 100));
    const prey = world.add(createLifer('Clip', 130, 100));

    assert.deepEqual(world.getNear(hunter), [prey]);

    world.remove(prey);

    assert.deepEqual(world.getNear(hunter), []);
});

test('существо, добавленное между тиками, попадает в сетку', () => {
    const world = new World(500, 500, 1);
    const hunter = world.add(createLifer('Stone', 100, 100));
    world.update(0);

    const spawned = world.add(createLifer('Clip', 130, 100));

    assert.deepEqual(world.getNear(hunter), [spawned]);
});

test('переход существа между ячейками отслеживается', () => {
    const grid = new SpatialGrid(500, 500, 50);
    const object = { x: 10, y: 10 };
    const other = { x: 260, y: 260 };
    grid.insert(object);
    grid.insert(other);

    assert.deepEqual(grid.collect(other, 100, []), []);

    object.x = 250;
    object.y = 250;
    grid.update(object);

    assert.deepEqual(grid.collect(other, 100, []), [object]);
});

test('служебное поле ячейки не попадает в состояние существа', () => {
    const world = new World(500, 500, 1);
    const lifer = world.add(createLifer('Stone', 10, 20));

    const fields = Object.keys(lifer);

    assert.equal(fields.some((field) => field.toLowerCase().includes('cell')), false);
    assert.equal(typeof lifer.frameFlags(), 'number');
});
