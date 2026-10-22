import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/core/world.js';
import { liferName } from '../src/core/species.js';

// Хранилище браузерное, поэтому подставляем своё: модуль обязан работать
// с любым, а заодно переживать его отсутствие и мусор внутри.
const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
globalThis.btoa = (text) => Buffer.from(text, 'binary').toString('base64');
globalThis.atob = (text) => Buffer.from(text, 'base64').toString('binary');

const { clear, load, save } = await import('../src/utils/store.js');

function busyWorld() {
  const world = new World(1000, 500, 5);
  world.populate('Tree', 12);
  world.populate('Logger', 3);
  world.place('Store', 500, 250);

  for (let tick = 0; tick < 300; tick++) {
    world.update(tick * 16);
  }

  return world;
}

const digest = (world) =>
  world.state
    .map((o) => [o.id, liferName(o), o.x, o.y, o.dx, o.dy, o.energy, o.load, o.stock, o.ttl].join(':'))
    .join('|');

test('сохранённый мир разворачивается тем же, каким был', () => {
  memory.clear();
  const live = busyWorld();

  assert.equal(save('k', live.captureSnapshot()), true);

  const restored = new World(1000, 500, 5);
  restored.loadSnapshot(load('k'));

  // до последнего бита: на этом же слепке держится и перемотка
  assert.equal(digest(restored), digest(live));
  assert.equal(restored.tick, live.tick);
  assert.equal(restored.nextId, live.nextId);
  assert.equal(restored.random.state, live.random.state);
});

test('развёрнутый мир считается дальше так же, как считался бы исходный', () => {
  memory.clear();
  const live = busyWorld();
  save('k', live.captureSnapshot());

  const restored = new World(1000, 500, 5);
  restored.loadSnapshot(load('k'));

  for (let tick = 300; tick < 500; tick++) {
    live.update(tick * 16);
    restored.update(tick * 16);
  }

  assert.equal(digest(restored), digest(live));
});

test('очистка убирает сохранённое', () => {
  memory.clear();
  save('k', busyWorld().captureSnapshot());
  assert.ok(load('k'));

  clear('k');

  assert.equal(load('k'), null);
});

test('битое сохранение не роняет загрузку, а забывается', () => {
  memory.clear();
  memory.set('k', '{это не json');

  // сохранение от прежней версии разбирать нечем — начинаем с чистого мира
  assert.equal(load('k'), null);
  assert.equal(memory.has('k'), false, 'и больше не мешается');
});

test('недоступное хранилище не ломает симуляцию', () => {
  const working = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('приватный режим');
    },
    setItem() {
      throw new Error('приватный режим');
    },
    removeItem() {
      throw new Error('приватный режим');
    },
  };

  assert.equal(save('k', busyWorld().captureSnapshot()), false);
  assert.equal(load('k'), null);

  globalThis.localStorage = working;
});
