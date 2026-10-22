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
  const intruder = (world) => world.place('Wolf', 500, 250);

  assert.deepEqual(run(scenario, 777, intruder), run(scenario, 777, intruder));
  assert.notDeepEqual(run(scenario, 777, intruder), run(scenario, 777));
});

// Главная гарантия истории: состояние любого записанного момента
// восстанавливается из ключевого кадра и журнала в точности, до последнего
// бита дробных величин. Без неё панель показывала бы правдоподобные, но
// неверные числа — а это хуже, чем не показывать ничего.
test('состояние любого момента восстанавливается точно', () => {
  const world = build(SCENARIOS[0], 2024);
  const truth = new Map();

  for (let tick = 0; tick < 800; tick++) {
    world.update(tick * 16);
    if (tick % 10 === 0) {
      truth.set(tick, digest(world));
    }
    // вмешательства пользователя посреди симуляции — их повторяет журнал
    if (tick === 111) {
      world.place('Wolf', 300, 200);
    }
    if (tick === 456) {
      world.place('Cow', 700, 100);
    }
  }

  assert.ok(world.keyframes.length >= 2, 'ключевых кадров должно быть несколько');

  for (const [tick, expected] of truth) {
    assert.equal(digest(world.at(tick)), expected, 'момент ' + tick);
  }
});

test('восстановление идёт от ближайшего ключевого кадра, а не с начала', () => {
  const world = build(SCENARIOS[0], 7);
  for (let tick = 0; tick < 700; tick++) {
    world.update(tick * 16);
  }

  const keyframe = world.keyframeFor(650);

  assert.equal(keyframe.tick, 600, 'взят последний кадр не позже нужного тика');
  assert.equal(world.keyframeFor(0).tick, 0);
});

test('остановленный матч замирает целиком', () => {
  const world = new World(WIDTH, HEIGHT, 5);
  world.place('Stone', 10, 10);
  world.setSpawnRate('Grass', 1);

  world.update(0);
  assert.equal(world.stopped, true, 'один вид бойцов — матч окончен');

  const after = { tick: world.tick, count: world.state.length, random: world.random.state };
  for (let i = 0; i < 50; i++) {
    world.update(i);
  }

  // подсев не должен идти после победы: время стоит, а поток случайных
  // чисел уходил бы вперёд — и восстановленный мир разошёлся бы с настоящим
  assert.equal(world.tick, after.tick);
  assert.equal(world.state.length, after.count);
  assert.equal(world.random.state, after.random, 'случайность тоже замерла');
});

test('журнал помнит все вмешательства извне и только их', () => {
  const world = new World(WIDTH, HEIGHT, 3);
  world.populate('Grass', 5);
  world.setSpawnRate('Grass', 1);

  for (let tick = 0; tick < 20; tick++) {
    world.update(tick * 16);
  }
  world.place('Wolf', 10, 10);

  // подсев выводится из случайности мира и в журнал не пишется —
  // иначе прогон применил бы его дважды
  assert.deepEqual(
    world.journal.map((event) => event.kind),
    ['populate', 'spawnRate', 'place'],
  );
  assert.equal(world.journal.at(-1).tick, 20);
  assert.ok(world.getCounts().Grass > 5, 'подсев при этом работал');
});

// Прогон сценария: слепки состояния мира на контрольных точках.
// after — вмешательство извне (аналог подселения кликом) после заселения.
function run(scenario, seed, after) {
  const world = build(scenario, seed);

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
}

function build(scenario, seed) {
  const world = new World(WIDTH, HEIGHT, seed);
  world.matchEnds = scenario.finish !== false;
  world.breeding = scenario.breeding === true;

  for (const [type, count] of Object.entries(scenario.setup)) {
    world.populate(type, count);
  }
  for (const [type, chance] of Object.entries(scenario.spawn || {})) {
    world.setSpawnRate(type, chance);
  }

  return world;
}

// Слепок мира: всё, от чего зависит его дальнейший ход. Порядок state
// не сортируем — он тоже часть состояния: по нему идёт обход тика.
function digest(world) {
  const lifers = world.state.map((lifer) =>
    [
      lifer.id,
      lifer.constructor.name,
      lifer.x,
      lifer.y,
      lifer.dx,
      lifer.dy,
      lifer.radius,
      lifer.radiusView,
      lifer.speed,
      lifer.ttl,
      lifer.energy,
      lifer.kills,
      lifer.berserkCounter,
      lifer.berserkTtl,
      lifer.behavior,
      lifer.state,
    ].join(':'),
  );

  return [world.tick, world.stopped, world.random.state, JSON.stringify(world.getCounts()), lifers.join('|')].join(' ');
}
