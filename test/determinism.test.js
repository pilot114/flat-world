import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world.js';
import { SCENARIOS } from '../src/scenarios.js';

const WIDTH = 1000;
const HEIGHT = 500;
const TICKS = 200;
// сверяем не только финал: разойтись и случайно сойтись обратно
// две симуляции могут, а совпасть на каждой контрольной точке — уже нет
const CHECKPOINT = 25;

for (const scenario of SCENARIOS) {
    test(`сценарий «${scenario.name}» воспроизводится по seed`, () => {
        assert.deepEqual(run(scenario, 12345), run(scenario, 12345));
    });
}

test('другой seed даёт другую симуляцию', () => {
    // иначе сравнение слепков ничего не доказывало бы: совпадать могло бы всё
    // подряд, включая мир, который просто не менялся
    const scenario = SCENARIOS[0];
    assert.notDeepEqual(run(scenario, 12345), run(scenario, 54321));
});

test('подселённое существо меняет исход, а не только текущий кадр', () => {
    const scenario = SCENARIOS[0];
    const intruder = (world) => world.populate('Wolf', 1);

    assert.deepEqual(run(scenario, 777, intruder), run(scenario, 777, intruder));
    assert.notDeepEqual(run(scenario, 777, intruder), run(scenario, 777));
});

// Прогон сценария: слепки состояния мира на контрольных точках.
// after — вмешательство извне (аналог подселения кликом) после заселения.
function run(scenario, seed, after) {
    return withSeed(seed, () => {
        const world = new World(WIDTH, HEIGHT);

        for (const [type, count] of Object.entries(scenario.setup)) {
            world.populate(type, count);
        }
        for (const [type, chance] of Object.entries(scenario.spawn || {})) {
            world.setSpawnRate(type, chance);
        }
        if (after) {
            after(world);
        }

        const checkpoints = [];
        for (let tick = 0; tick < TICKS; tick++) {
            world.update(tick * 16);
            if (tick % CHECKPOINT === 0) {
                checkpoints.push(digest(world));
            }
        }

        return checkpoints;
    });
}

// Слепок мира: всё, от чего зависит его дальнейший ход. Порядок state
// не сортируем — он тоже часть состояния: по нему идёт обход тика.
function digest(world) {
    const lifers = world.state.map((lifer) => [
        lifer.id,
        lifer.type,
        lifer.x,
        lifer.y,
        lifer.dx,
        lifer.dy,
        lifer.radius,
        lifer.speed,
        lifer.ttl,
        lifer.behavior
    ].join(':'));

    return [
        world.tick,
        world.stopped,
        // история питает перемотку и график — она тоже должна повторяться
        world.history.length,
        JSON.stringify(world.getCounts()),
        lifers.join('|')
    ].join(' ');
}

// Мир берёт случайность только из Math.random: координаты при заселении,
// стартовый импульс и подсев. Подменяем её сеяным генератором — тогда
// расхождение между прогонами может прийти только из самой симуляции.
function withSeed(seed, body) {
    const original = Math.random;
    Math.random = mulberry32(seed);

    try {
        return body();
    } finally {
        Math.random = original;
    }
}

// mulberry32 — короткий ГПСЧ с 32-битным состоянием; качество распределения
// здесь не важно, важна повторяемость потока при одном seed.
function mulberry32(seed) {
    let state = seed >>> 0;

    return function () {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
