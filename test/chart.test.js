import test from 'node:test';
import assert from 'node:assert/strict';

import { linearScale, linePath, niceMax, tickStep, ticks } from '../src/utils/chart.js';

test('шкала переводит значения в пиксели, ось Y — сверху вниз', () => {
    const x = linearScale(299, 0, 350);
    assert.equal(x(0), 0);
    assert.equal(x(299), 350);

    // у оси Y начало диапазона — низ графика, поэтому ноль внизу
    const y = linearScale(100, 170, 0);
    assert.equal(y(0), 170);
    assert.equal(y(100), 0);
    assert.equal(y(50), 85);
});

test('пустая шкала не делит на ноль', () => {
    const y = linearScale(0, 170, 0);
    assert.ok(Number.isFinite(y(0)));
});

test('шаг делений округляется к ближайшему круглому, а не всегда вверх', () => {
    // 120/10 = 12: до 20 округлять грубо, ближе 10
    assert.equal(tickStep(120, 10), 10);
    // 299/15 ≈ 19.9 — здесь ближе как раз 20
    assert.equal(tickStep(299, 15), 20);
    assert.equal(tickStep(100, 10), 10);
    assert.equal(tickStep(1000, 10), 100);
});

test('верх оси округляется до кратного шагу делений', () => {
    // главный случай: 112 должно дать 120, а не 200
    assert.equal(niceMax(112), 120);
    assert.equal(niceMax(1), 1);
    assert.equal(niceMax(37), 40);
    assert.equal(niceMax(200), 200);

    // пустой мир не должен схлопывать ось в точку
    assert.equal(niceMax(0), 1);
    assert.equal(niceMax(-5), 1);
});

test('верх оси не поднимается на лишнее деление, когда уже кратен шагу', () => {
    // умножение на дробный шаг оставляет хвосты — на них niceMax спотыкался
    for (const value of [1, 2, 5, 10, 20, 50, 100, 120]) {
        assert.equal(niceMax(value), value, 'значение уже круглое: ' + value);
    }
});

test('верх оси всегда попадает на деление', () => {
    // Инвариант всей оси: округлив верх, мы расширяем диапазон и можем сменить
    // шаг делений — тогда прежний верх ему уже не кратен и ось обрывается,
    // не достав до края. Поэтому niceMax округляет в несколько заходов.
    for (let value = 1; value <= 500; value++) {
        const top = niceMax(value);
        const last = ticks(top).at(-1);

        assert.equal(last, top, `верх ${top} (из ${value}) не совпал с последним делением ${last}`);
        assert.ok(top >= value, `верх ${top} ниже данных ${value}`);
    }
});

test('деления идут от нуля до верха включительно', () => {
    assert.deepEqual(ticks(120, 10), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    assert.deepEqual(ticks(1), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);

    // накопление дробного шага уплывает — значения должны оставаться круглыми
    for (const value of ticks(1)) {
        assert.equal(value, Number(value.toFixed(10)));
    }
});

test('путь строится по индексу точки, первая команда — M', () => {
    const x = (i) => i * 10;
    const y = (value) => 100 - value;

    assert.equal(linePath([5, 7], x, y), 'M0,95L10,93');
    assert.equal(linePath([], x, y), '');
    assert.equal(linePath([3], x, y), 'M0,97');
});

test('смещение неполного окна прижимает данные к правому краю', () => {
    const x = linearScale(299, 0, 350);
    // окно на 300 кадров, данных пока 100 — рисуем начиная с 200-го деления
    const offset = 300 - 100;
    const path = linePath([1, 2], (i) => x(i + offset), (value) => value);

    assert.ok(path.startsWith('M' + x(offset)), 'первая точка сдвинута: ' + path);
});
