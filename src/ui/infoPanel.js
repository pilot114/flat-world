import { liferFieldGroups } from '../core/lifers.js';
import { objectToString } from '../utils/dom.js';
import { formatByteSize } from '../utils/memory.js';
import { Tabs } from './tabs.js';

// Текстовые панели: состояние мира и выделенное существо.
// Счётчики по типам живут в SpeciesPanel — там же, где цвета.
//
// Поля выделенного разложены по вкладкам — по вкладке на класс иерархии:
// плоским списком из полутора десятков полей не видно, что у камня своё,
// а что досталось ему от любого движущегося существа.
export class InfoPanel {
    constructor(worldId, selectId, selectTabsId) {
        this.worldInfo = document.getElementById(worldId);
        this.selectInfo = document.getElementById(selectId);
        this.selectTabs = document.getElementById(selectTabsId);
        this.selectTabsId = selectTabsId;

        // render зовётся каждый кадр, а вкладки зависят только от класса —
        // пересобираем их при смене типа выделенного, а не постоянно
        this.shownType = null;
        this.group = null;
        this.shownText = null;
    }

    render(world) {
        this.worldInfo.innerText = objectToString({
            tick: world.tick,
            sec: Math.round(world.ms / 1000),
            fps: world.ms > 0 ? Math.round(1000 / (world.ms / world.tick)) : 0,
            frames: world.history.length,
            history: formatByteSize(world.historyBytes)
        });

        this.renderSelect(world.select);
    }

    renderSelect(lifer) {
        if (!lifer) {
            this.clearSelect();
            return;
        }

        if (lifer.type !== this.shownType) {
            this.shownType = lifer.type;
            this.buildTabs(liferFieldGroups(lifer));
        }

        const fields = {};
        for (const field of this.group.fields) {
            fields[field] = format(lifer[field]);
        }

        // значения меняются каждый тик, но не каждый кадр
        const text = objectToString(fields);
        if (text !== this.shownText) {
            this.selectInfo.innerText = text;
            this.shownText = text;
        }
    }

    buildTabs(groups) {
        const items = groups.map((group) => ({ id: group.name, name: group.name }));

        this.tabs = new Tabs(this.selectTabsId, items, (item) => {
            this.group = groups.find((group) => group.name === item.id);
            this.shownText = null;
        });

        // по умолчанию — самый конкретный класс: он и делает существо собой
        this.tabs.select(items[items.length - 1].id);
    }

    clearSelect() {
        if (this.shownType === null) {
            return;
        }

        this.shownType = null;
        this.group = null;
        this.shownText = null;
        this.tabs = null;
        this.selectTabs.replaceChildren();
        this.selectInfo.innerText = '';
    }
}

// Внутри мир считает в долях пикселя, но показывать дробную пыль незачем:
// координаты округляем до пикселей, мелкие величины — до сотых.
function format(value) {
    if (!Number.isFinite(value) || Number.isInteger(value)) {
        return value;
    }
    return Math.abs(value) >= 10 ? Math.round(value) : Number(value.toFixed(2));
}
