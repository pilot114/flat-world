import { liferColor } from '../core/species.js';
import { linearScale, linePath, niceMax, ticks } from '../utils/chart.js';

const NS = 'http://www.w3.org/2000/svg';
const MARGIN = { top: 10, right: 10, bottom: 20, left: 40 };
// делений примерно столько: точное число подбирается под круглый шаг
const X_TICKS = 15;
const Y_TICKS = 10;

// График численности по кадрам истории мира.
// Собственного хода времени у него нет: что показать — решает позиция плеера,
// поэтому пауза и перемотка действуют на график так же, как на канвас.
// types задаёт сценарий: рисуем линии только его видов.
export class Graph {
    constructor(selector, world, types, windowSize = 300) {
        this.windowSize = windowSize;
        this.paths = new Map();
        // тик последнего показанного кадра: по нему решаем, изменилось ли окно
        this.lastTick = null;
        // верх оси Y, отрисованный сейчас — ось перерисовываем только при смене
        this.shownTop = null;
        // сдвиг неполного окна: свежие данные всегда у правого края
        this.offset = 0;

        const svg = document.querySelector(selector);
        // график пересобирается при смене сценария: оси и линии считаются
        // от начального населения, дорисовать их к старым нельзя
        svg.replaceChildren();

        this.width = Number(svg.getAttribute('width')) - MARGIN.left - MARGIN.right;
        this.height = Number(svg.getAttribute('height')) - MARGIN.top - MARGIN.bottom;

        const root = node('g', { transform: `translate(${MARGIN.left},${MARGIN.top})` }, svg);

        this.x = linearScale(windowSize - 1, 0, this.width);

        // окно линий шире холста, поэтому обрезаем их по области графика
        const clip = node('clipPath', { id: 'graph-clip' }, node('defs', {}, root));
        node('rect', { width: this.width, height: this.height }, clip);

        this.xAxis = node('g', {
            class: 'axis axis--x',
            transform: `translate(0,${this.height})`
        }, root);
        this.yAxis = node('g', { class: 'axis axis--y' }, root);

        this.renderXAxis();
        this.setTop(Math.max(1, world.maxCounts()));

        const lines = node('g', { 'clip-path': 'url(#graph-clip)' }, root);

        // линия на каждый вид сценария, даже если его пока нет в мире
        for (const type of types) {
            this.paths.set(type, node('path', {
                class: 'line',
                stroke: liferColor(type)
            }, lines));
        }
    }

    // position === null — конец истории (живой режим), иначе выбранный кадр.
    render(history, position) {
        const end = position === null ? history.length - 1 : position;
        if (end < 0) {
            return;
        }

        // Окно не сдвинулось (пауза) — перестраивать пути незачем.
        // Опознаём его по тику последнего кадра, а не по номеру: когда история
        // упирается в лимит и начинает вытеснять старые кадры, номер последнего
        // застывает навсегда, а мир продолжает идти — по номеру график замирал.
        const last = history[end];
        if (last.tick === this.lastTick) {
            return;
        }
        this.lastTick = last.tick;

        const start = Math.max(0, end - this.windowSize + 1);
        const frames = history.slice(start, end + 1);
        this.offset = this.windowSize - frames.length;

        this.rescale(frames);

        for (const [type, path] of this.paths) {
            const values = frames.map((frame) => frame.counts[type] || 0);
            path.setAttribute('d', linePath(values, (i) => this.x(i + this.offset), this.y));
        }
    }

    // Ось Y тянется за окном: видов может стать больше, чем было вначале,
    // и без пересчёта линии уходят вверх за край и срезаются clip-path.
    rescale(frames) {
        let max = 0;

        for (const frame of frames) {
            for (const type of this.paths.keys()) {
                const value = frame.counts[type] || 0;
                if (value > max) {
                    max = value;
                }
            }
        }

        // верх округляем до кратного шагу делений, поэтому колебания
        // численности не дёргают ось на каждом кадре
        const top = niceMax(Math.max(1, max), Y_TICKS);
        if (top !== this.shownTop) {
            this.setTop(top);
        }
    }

    setTop(top) {
        this.shownTop = top;
        this.y = linearScale(top, this.height, 0);
        this.renderYAxis();
    }

    renderYAxis() {
        this.yAxis.replaceChildren();
        node('path', { class: 'domain', d: `M0,0V${this.height}` }, this.yAxis);

        for (const value of ticks(this.shownTop, Y_TICKS)) {
            const tick = node('g', {
                class: 'tick',
                transform: `translate(0,${this.y(value)})`
            }, this.yAxis);

            node('line', { x2: -6 }, tick);
            node('text', { x: -9, dy: '0.32em', 'text-anchor': 'end' }, tick).textContent = value;
        }
    }

    // Ось X неподвижна: окно всегда одной ширины в кадрах.
    renderXAxis() {
        node('path', { class: 'domain', d: `M0,0H${this.width}` }, this.xAxis);

        for (const value of ticks(this.windowSize - 1, X_TICKS)) {
            const tick = node('g', {
                class: 'tick',
                transform: `translate(${this.x(value)},0)`
            }, this.xAxis);

            node('line', { y2: 6 }, tick);
            node('text', { y: 9, dy: '0.71em', 'text-anchor': 'middle' }, tick).textContent = value;
        }
    }
}

// Создаёт узел SVG: у них своё пространство имён, обычный createElement
// собрал бы элемент, который браузер не станет рисовать.
function node(name, attrs, parent) {
    const el = document.createElementNS(NS, name);

    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
    }
    if (parent) {
        parent.appendChild(el);
    }

    return el;
}
