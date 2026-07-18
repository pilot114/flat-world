import { objectToString } from '../utils/dom.js';
import { formatByteSize } from '../utils/memory.js';

// Текстовые панели: состояние мира и выделенное существо.
// Счётчики по типам живут в SpeciesPanel — там же, где цвета.
export class InfoPanel {
    constructor(worldId, selectId) {
        this.worldInfo = document.getElementById(worldId);
        this.selectInfo = document.getElementById(selectId);
    }

    render(world) {
        this.worldInfo.innerText = objectToString({
            tick: world.tick,
            sec: Math.round(world.ms / 1000),
            fps: world.ms > 0 ? Math.round(1000 / (world.ms / world.tick)) : 0,
            frames: world.history.length,
            history: formatByteSize(world.historyBytes)
        });

        this.selectInfo.innerText = world.select ? describe(world.select) : '';
    }
}

function describe(lifer) {
    const fields = {};
    for (const property in lifer) {
        if (typeof lifer[property] !== 'function') {
            fields[property] = format(lifer[property]);
        }
    }
    return objectToString(fields);
}

// Внутри мир считает в долях пикселя, но показывать дробную пыль незачем:
// координаты округляем до пикселей, мелкие величины — до сотых.
function format(value) {
    if (!Number.isFinite(value) || Number.isInteger(value)) {
        return value;
    }
    return Math.abs(value) >= 10 ? Math.round(value) : Number(value.toFixed(2));
}
