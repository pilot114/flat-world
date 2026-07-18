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

// Одинокий боец закончил бы матч на нулевом тике, и кадр не успел бы
// записаться — здесь речь не о матче, поэтому его победу не разыгрываем.
function sandboxWorld() {
    const world = new World(500, 500);
    world.matchEnds = false;
    return world;
}

test('пометка кадра рисуется по его координатам, а не по живым', () => {
    const world = sandboxWorld();
    const lifer = world.add(new Stone(100, 100));
    world.update(0);

    const frame = world.history[0];
    const shown = { x: frame.xs[0], y: frame.ys[0] };

    // существо уехало после записи кадра
    lifer.x = 400;
    lifer.y = 400;
    world.select = lifer;

    const context = stubContext();
    drawSelection(context, world.selectionInFrame(frame));

    assert.deepEqual(context.arcs, [{ ...shown, radius: lifer.radiusView }]);
    assert.notEqual(shown.x, Math.round(lifer.x), 'живые координаты уже другие');
    assert.equal(context.texts[0].text, 'id:' + lifer.id);
});

test('съеденное существо всё равно помечается в кадре, где оно живо', () => {
    const world = sandboxWorld();
    const doomed = world.add(new Stone(100, 100));
    world.update(0);

    const frame = world.history[0];
    world.select = doomed;
    world.remove(doomed);

    // живого объекта больше нет — радиус обзора берётся видовой
    const marked = world.selectionInFrame(frame);

    assert.equal(world.select, null, 'в живом мире выделять нечего');
    assert.deepEqual(marked, {
        id: doomed.id,
        x: frame.xs[0],
        y: frame.ys[0],
        radiusView: Stone.prototype.radiusView
    });

    const context = stubContext();
    drawSelection(context, marked);
    assert.equal(context.arcs.length, 1, 'круг обзора рисуется и для съеденного');
});

test('в кадре, где существа ещё не было, помечать нечего', () => {
    const world = new World(500, 500);
    world.add(new Grass(10, 10));
    world.update(0);

    // подселён после записи кадра
    const late = world.add(new Stone(200, 200));
    world.select = late;

    assert.equal(world.selectionInFrame(world.history[0]), null);
});

test('без выделения пометки нет', () => {
    const world = new World(500, 500);
    world.add(new Grass(10, 10));
    world.update(0);

    assert.equal(world.selectionInFrame(world.history[0]), null);
});

test('у существа без обзора рисуется только подпись', () => {
    const world = new World(500, 500);
    const grass = world.add(new Grass(50, 60));
    world.update(0);
    world.select = grass;

    const context = stubContext();
    drawSelection(context, world.selectionInFrame(world.history[0]));

    // трава ничего не видит — круга у неё нет ни в живом мире, ни в истории
    assert.deepEqual(context.arcs, []);
    assert.equal(context.texts[0].text, 'id:' + grass.id);
});
