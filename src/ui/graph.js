/* global d3 */
import { liferColor, liferTypes } from '../core/lifers.js';

// График численности по кадрам истории мира.
// Собственного хода времени у него нет: что показать — решает позиция плеера,
// поэтому пауза и перемотка действуют на график так же, как на канвас.
export class Graph {
    constructor(selector, world, windowSize = 300) {
        this.windowSize = windowSize;
        this.paths = new Map();
        this.lastEnd = null;
        // сдвиг неполного окна: свежие данные всегда у правого края
        this.offset = 0;

        const svg = d3.select(selector);
        const margin = { top: 10, right: 10, bottom: 20, left: 40 };
        const width = +svg.attr('width') - margin.left - margin.right;
        const height = +svg.attr('height') - margin.top - margin.bottom;
        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        this.xAxis = d3.scaleLinear().domain([0, windowSize - 1]).range([0, width]);
        this.yAxis = d3.scaleLinear().domain([0, world.maxCounts()]).range([height, 0]);

        // d — значение, i — номер отсчёта в окне
        this.line = d3.line().x((d, i) => this.xAxis(i + this.offset)).y((d) => this.yAxis(d));

        g.append('defs').append('clipPath')
            .attr('id', 'clip')
            .append('rect')
            .attr('width', width)
            .attr('height', height);

        g.append('g')
            .attr('class', 'axis axis--x')
            .attr('transform', `translate(0,${this.yAxis(0)})`)
            .call(d3.axisBottom(this.xAxis));

        g.append('g')
            .attr('class', 'axis axis--y')
            .call(d3.axisLeft(this.yAxis));

        const lines = g.append('g').attr('clip-path', 'url(#clip)');

        // линия на каждый тип из реестра, даже если его пока нет в мире
        for (const type of liferTypes()) {
            this.paths.set(type, lines.append('path')
                .attr('class', 'line')
                .style('stroke', liferColor(type)));
        }
    }

    // position === null — конец истории (живой режим), иначе выбранный кадр.
    render(history, position) {
        const end = position === null ? history.length - 1 : position;
        if (end < 0) {
            return;
        }

        // окно не сдвинулось (пауза) — перестраивать пути незачем
        if (end === this.lastEnd) {
            return;
        }
        this.lastEnd = end;

        const start = Math.max(0, end - this.windowSize + 1);
        const frames = history.slice(start, end + 1);
        this.offset = this.windowSize - frames.length;

        for (const [type, path] of this.paths) {
            path.attr('d', this.line(frames.map((frame) => frame.counts[type] || 0)));
        }
    }
}
