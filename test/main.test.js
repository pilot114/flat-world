import test from 'node:test';
import assert from 'node:assert/strict';

// Запуск приложения целиком на заглушках браузера.
//
// Всё остальное в наборе проверяет ядро, а склейка — где какой элемент берут,
// в каком порядке объявляют, кто на кого подписан — не проверялась ничем.
// И именно там завёлся `Cannot access 'forget' before initialization`:
// обработчик регистрировали раньше, чем объявляли кнопку. Ядро при этом было
// в полном порядке, а страница не открывалась.

function makeElement(tag = 'div') {
    const classes = new Set();
    const element = {
        tagName: tag,
        className: '',
        type: '',
        name: '',
        value: '0',
        min: '0',
        max: '0',
        checked: false,
        disabled: false,
        width: 0,
        height: 0,
        textContent: '',
        innerText: '',
        style: {},
        children: [],
        listeners: {},
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name),
            toggle: (name, on) => (on ?? !classes.has(name)) ? classes.add(name) : classes.delete(name)
        },
        appendChild(child) { element.children.push(child); return child; },
        append(...kids) { element.children.push(...kids); },
        replaceChildren(...kids) { element.children.length = 0; element.children.push(...kids); },
        setAttribute() {},
        getAttribute: (name) => (name === 'width' ? '400' : '200'),
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
        getContext: () => context,
        addEventListener(name, handler) { (element.listeners[name] ??= []).push(handler); },
        fire(name, event) { (element.listeners[name] ?? []).forEach((handler) => handler(event)); }
    };
    return element;
}

const context = {
    arc() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
    fillText() {}, clearRect() {},
    set fillStyle(_) {}, set font(_) {}, set textBaseline(_) {},
    set textAlign(_) {}, set lineWidth(_) {}
};

// Сколько кадров отрисовки прокрутить: цикл зовёт себя сам, и без предела
// он не вернул бы управление никогда.
let framesLeft = 0;
const nodes = new Map();
const load = [];

globalThis.document = {
    getElementById: (id) => nodes.get(id) ?? nodes.set(id, makeElement()).get(id),
    createElement: makeElement,
    createElementNS: (ns, tag) => makeElement(tag),
    querySelector: () => makeElement('svg')
};
globalThis.window = { addEventListener: (name, handler) => name === 'load' && load.push(handler) };
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = (frame) => {
    if (framesLeft-- > 0) {
        frame();
    }
};
const memory = new Map();
globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key)
};
globalThis.btoa = (text) => Buffer.from(text, 'binary').toString('base64');
globalThis.atob = (text) => Buffer.from(text, 'base64').toString('binary');

await import('../src/main.js');

function start(frames = 3) {
    framesLeft = frames;
    load[0]();
}

test('приложение поднимается и крутит кадры', () => {
    assert.equal(load.length, 1, 'main повешен на загрузку страницы');

    // сам факт, что это не бросает, и есть проверка: порядок объявлений,
    // имена элементов, подписки — всё склеено верно
    assert.doesNotThrow(() => start());

    assert.ok(nodes.get('tabs').children.length > 0, 'вкладки сценариев собраны');
    assert.ok(nodes.get('speed').children.length > 0, 'ряд скоростей собран');
    assert.ok(nodes.get('species').children.length > 0, 'каталог видов собран');
    assert.ok(nodes.get('canvas').width > 0, 'канвас размечен');
});

test('переключение сценариев и вкладок не роняет приложение', () => {
    start();

    const scenarios = nodes.get('tabs').children;
    for (const label of scenarios) {
        framesLeft = 2;
        assert.doesNotThrow(() => label.children[0].fire('click'), label.children[1].textContent);
    }

    for (const label of nodes.get('sideTabs').children) {
        framesLeft = 2;
        assert.doesNotThrow(() => label.children[0].fire('click'));
    }
});

test('клик по канвасу подселяет, выделяет и стирает', () => {
    start();

    const sandbox = nodes.get('tabs').children
        .find((label) => label.children[1].textContent === 'Sandbox');
    framesLeft = 2;
    sandbox.children[0].fire('click');

    const canvas = nodes.get('canvas');
    const catalog = nodes.get('species').children.filter((el) => el.className.startsWith('species'));
    const pick = (name) => catalog.find((el) => el.children[1].textContent === name).fire('click');

    // подселяем
    pick('Wolf');
    assert.doesNotThrow(() => canvas.fire('click', { clientX: 300, clientY: 200 }));

    // выделяем: снимаем выбор вида и щёлкаем по существу
    pick('Wolf');
    assert.doesNotThrow(() => canvas.fire('click', { clientX: 300, clientY: 200 }));

    // стираем
    pick('ластик');
    assert.doesNotThrow(() => canvas.fire('click', { clientX: 300, clientY: 200 }));

    framesLeft = 2;
    assert.doesNotThrow(() => nodes.get('forget').fire('click'), 'и забываем песочницу');
});
