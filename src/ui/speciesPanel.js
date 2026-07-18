import { liferColor } from '../core/species.js';

// Список типов существ: цвет, название, текущее количество.
// Он же служит палитрой — выбранный тип подселяется кликом по канвасу.
// types задаёт сценарий: чужие виды в списке только мешали бы.
export class SpeciesPanel {
    constructor(id, types) {
        this.selected = null;
        this.rows = new Map();

        const container = document.getElementById(id);
        // панель пересобирается при смене сценария — старые строки убираем
        container.replaceChildren();

        // показываем все виды сценария, даже вымершие: иначе их не заселить заново
        for (const type of types) {
            const row = this.createRow(type);
            this.rows.set(type, row);
            container.appendChild(row.el);
        }
    }

    createRow(type) {
        const el = document.createElement('div');
        el.className = 'species';

        const dot = document.createElement('i');
        dot.className = 'species-dot';
        dot.style.backgroundColor = liferColor(type);

        const name = document.createElement('span');
        name.className = 'species-name';
        name.textContent = type;

        const count = document.createElement('span');
        count.className = 'species-count';
        count.textContent = '0';

        el.append(dot, name, count);
        el.addEventListener('click', () => {
            this.select(this.selected === type ? null : type);
        });

        return { el, count, shown: '0' };
    }

    select(type) {
        this.selected = type;

        for (const [rowType, row] of this.rows) {
            row.el.classList.toggle('active', rowType === type);
        }
    }

    render(counts) {
        for (const [type, row] of this.rows) {
            const value = String(counts[type] || 0);
            // трогаем DOM только при изменении — render зовётся каждый кадр
            if (value !== row.shown) {
                row.count.textContent = value;
                row.shown = value;
            }
        }
    }
}
