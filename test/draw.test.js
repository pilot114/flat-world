import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world.js';
import { Grass, Stone } from '../src/core/species.js';
import { drawSelection } from '../src/render/draw.js';

// Заглушка 2d-контекста: запоминает круги и подписи, которые её просили нарисовать.
function stubContext() {
    const arcs = [];
    const texts = [];

    return {
        arcs,
        texts,
        arc: (x, y, radius) => arcs.push({ x, y, radius }),
        fillText: (text, x, y) => texts.push({ text, x, y }),
        beginPath() {}, closePath() {}, fill() {}, stroke() {},
        set fillStyle(_) {}, set font(_) {}, set textBaseline(_) {},
        set textAlign(_) {}, set lineWidth(_) {}
    };
}

// Одинокий боец закончил бы матч на нулевом тике, и история не успела бы
// записаться — здесь речь не о матче, поэтому его победу не разыгрываем.
function sandboxWorld(seed = 1) {
    const world = new World(500, 500, seed);
    world.matchEnds = false;
    return world;
}

test('пометка при перемотке рисуется по состоянию того момента', () => {
    const world = sandboxWorld();
    const lifer = world.add(new Stone(100, 100));

    for (let tick = 0; tick < 40; tick++) {
        world.update(tick * 16);
    }

    world.select = lifer;
    const past = world.selectionAt(10);

    const context = stubContext();
    drawSelection(context, past);

    assert.deepEqual(context.arcs, [{ x: past.x, y: past.y, radius: past.radiusView }]);
    assert.equal(context.texts[0].text, 'id:' + lifer.id);

    // существо с тех пор уехало — пометка не должна следовать за ним
    assert.notEqual(past.x, lifer.x, 'координаты того момента, а не нынешние');
});

test('съеденное существо помечается в том моменте, где оно живо', () => {
    const world = sandboxWorld();
    const doomed = world.add(new Stone(100, 100));

    for (let tick = 0; tick < 20; tick++) {
        world.update(tick * 16);
    }

    world.select = doomed;
    world.remove(doomed);

    assert.equal(world.select, null, 'в живом мире выделять нечего');

    const past = world.selectionAt(10);
    assert.equal(past.id, doomed.id, 'а в прошлом оно ещё живо');

    const context = stubContext();
    drawSelection(context, past);
    assert.equal(context.arcs.length, 1, 'круг обзора рисуется и для съеденного');
});

test('в моменте, где существа ещё не было, помечать нечего', () => {
    const world = sandboxWorld();
    world.add(new Grass(10, 10));

    for (let tick = 0; tick < 40; tick++) {
        world.update(tick * 16);
    }

    // подселён позже показанного момента
    const late = world.place('Stone', 200, 200);
    world.select = late;

    assert.equal(world.selectionAt(10), null);
});

test('без выделения пометки нет', () => {
    const world = sandboxWorld();
    world.add(new Grass(10, 10));
    world.update(0);

    assert.equal(world.selectionAt(0), null);
});

test('у существа без обзора рисуется только подпись', () => {
    const world = sandboxWorld();
    const grass = world.add(new Grass(50, 60));
    world.update(0);
    world.select = grass;

    const context = stubContext();
    drawSelection(context, world.selectionAt(0));

    // трава ничего не видит — круга у неё нет ни в живом мире, ни в истории
    assert.deepEqual(context.arcs, []);
    assert.equal(context.texts[0].text, 'id:' + grass.id);
});
