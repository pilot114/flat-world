import { liferFieldTable, nameOfType } from '../core/species.js';
import { objectToString } from '../utils/dom.js';

// Текстовые панели: состояние мира и выделенное существо.
// Счётчики по типам живут в SpeciesPanel — там же, где цвета.
//
// Поля выделенного показываются таблицей: колонки — классы иерархии, строки —
// поля. Вкладки на класс, стоявшие здесь раньше, прятали главное: чтобы
// увидеть, что Stone переопределил цвет Base, приходилось щёлкать туда-сюда
// и держать значения в голове. В таблице это одна строка.
export class InfoPanel {
    constructor({ worldId, selectId }) {
        this.worldInfo = document.getElementById(worldId);
        this.selectInfo = document.getElementById(selectId);

        // render зовётся каждый кадр, а разметка таблицы меняется куда реже
        this.shownType = null;
        this.shownValues = null;
        this.cells = null;
    }

    // selected — выделенное существо на показанный момент: в живом режиме
    // это объект мира, при перемотке — он же, восстановленный на тот тик.
    render(world, selected) {
        // Расход памяти живёт во вкладке «состояние»: здесь он мешался
        // числам, за которыми следят по ходу симуляции.
        this.worldInfo.innerText = objectToString({
            tick: world.tick,
            sec: Math.round(world.ms / 1000),
            frames: world.history.length
        });

        this.renderSelect(selected);
    }

    renderSelect(lifer) {
        if (!lifer) {
            this.clearSelect();
            return;
        }

        const table = liferFieldTable(lifer);

        // разметка зависит только от класса — пересобираем её при смене вида
        if (lifer.constructor !== this.shownType) {
            this.shownType = lifer.constructor;
            this.shownValues = null;
            this.buildTable(table);
        }

        // значения меняются каждый тик, но не каждый кадр
        const shown = table.rows.map((row) => row.cells.map(text).join(' ')).join('|');
        if (shown === this.shownValues) {
            return;
        }
        this.shownValues = shown;

        table.rows.forEach((row, i) => {
            row.cells.forEach((cell, j) => {
                this.cells[i][j].textContent = text(cell);
            });
        });
    }

    buildTable(table) {
        const el = document.createElement('table');
        el.className = 'fields';

        const head = el.appendChild(document.createElement('tr'));
        head.appendChild(document.createElement('th'));
        for (const name of table.classes) {
            head.appendChild(document.createElement('th')).textContent = name;
        }

        this.cells = table.rows.map((row) => {
            const line = el.appendChild(document.createElement('tr'));
            line.appendChild(document.createElement('th')).textContent = row.field;

            return row.cells.map((cell) => {
                const box = line.appendChild(document.createElement('td'));
                // унаследованную ячейку затемняем: класс её не объявлял,
                // значение пришло сверху по цепочке
                if (cell === null) {
                    box.className = 'inherited';
                }
                return box;
            });
        });

        this.selectInfo.replaceChildren(el);
    }

    clearSelect() {
        if (this.shownType === null) {
            return;
        }

        this.shownType = null;
        this.shownValues = null;
        this.cells = null;
        this.selectInfo.replaceChildren();
    }
}

// Пустая строка для унаследованной ячейки, иначе — значение.
function text(cell) {
    return cell === null ? '' : String(format(cell.value));
}

// Внутри мир считает в долях пикселя, но показывать дробную пыль незачем:
// координаты округляем до пикселей, мелкие величины — до сотых.
function format(value) {
    // в danger, target и dropAt лежат классы: показываем имя вида,
    // а не исходник класса целиком
    if (typeof value === 'function') {
        return nameOfType(value);
    }
    if (!Number.isFinite(value) || Number.isInteger(value)) {
        return value;
    }
    return Math.abs(value) >= 10 ? Math.round(value) : Number(value.toFixed(2));
}
