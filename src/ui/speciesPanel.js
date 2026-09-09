import { liferColor, liferKinds } from '../core/species.js';

// Ластик — такой же выбор в каталоге, как и вид: клик по канвасу с ним
// убирает ближайшее существо.
export const ERASER = 'eraser';

// Каталог видов: цвет, название, текущее количество.
// Он же палитра — выбранный вид подселяется кликом по канвасу.
//
// types задаёт сценарий: чужие виды в списке только мешали бы. Когда их
// много — в песочнице семнадцать, — они разбиваются по группам иерархии:
// такой список подряд взглядом не окинуть.
export class SpeciesPanel {
    constructor(id, types, { eraser = false } = {}) {
        this.selected = null;
        this.rows = new Map();

        const container = document.getElementById(id);
        // панель пересобирается при смене сценария — старые строки убираем
        container.replaceChildren();

        // заголовки групп нужны только там, где видов правда много
        const grouped = types.length > 6;
        container.className = grouped ? 'catalog grouped' : 'catalog';

        for (const kind of liferKinds()) {
            const mine = kind.types.filter((type) => types.includes(type));
            if (!mine.length) {
                continue;
            }

            if (grouped) {
                const title = document.createElement('div');
                title.className = 'catalog-kind';
                title.textContent = kind.name;
                container.appendChild(title);
            }

            // показываем все виды сценария, даже вымершие: иначе их не заселить
            for (const type of mine) {
                const row = this.createRow(type, liferColor(type), type);
                this.rows.set(type, row);
                container.appendChild(row.el);
            }
        }

        if (eraser) {
            if (grouped) {
                const title = document.createElement('div');
                title.className = 'catalog-kind';
                title.textContent = 'убрать';
                container.appendChild(title);
            }

            const row = this.createRow(ERASER, 'transparent', 'ластик');
            this.rows.set(ERASER, row);
            container.appendChild(row.el);
        }
    }

    createRow(type, color, label) {
        const el = document.createElement('div');
        el.className = type === ERASER ? 'species eraser' : 'species';

        const dot = document.createElement('i');
        dot.className = 'species-dot';
        dot.style.backgroundColor = color;

        const name = document.createElement('span');
        name.className = 'species-name';
        name.textContent = label;

        const count = document.createElement('span');
        count.className = 'species-count';

        el.append(dot, name, count);
        el.addEventListener('click', () => {
            this.select(this.selected === type ? null : type);
        });

        return { el, count, shown: null };
    }

    select(type) {
        this.selected = type;

        for (const [rowType, row] of this.rows) {
            row.el.classList.toggle('active', rowType === type);
        }
    }

    render(counts) {
        for (const [type, row] of this.rows) {
            // у ластика считать нечего
            const value = type === ERASER ? '' : String(counts[type] || 0);
            // трогаем DOM только при изменении — render зовётся каждый кадр
            if (value !== row.shown) {
                row.count.textContent = value;
                row.shown = value;
            }
        }
    }
}
