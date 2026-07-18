// Равномерная сетка для поиска соседей: вместо перебора всего мира
// проверяем только ячейки, попадающие в радиус обзора.

// Ячейку объекта храним под символом, чтобы поле не попадало
// ни в for...in панели выделения, ни в export().
const CELL = Symbol('cell');

export class SpatialGrid {
    constructor(width, height, cellSize = 50) {
        this.cellSize = cellSize;
        this.cols = Math.max(1, Math.ceil(width / cellSize));
        this.rows = Math.max(1, Math.ceil(height / cellSize));

        this.cells = new Array(this.cols * this.rows);
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i] = [];
        }
    }

    // Индекс ячейки по координатам; точки за границами прижимаются к краю.
    indexOf(x, y) {
        const col = clamp(Math.floor(x / this.cellSize), 0, this.cols - 1);
        const row = clamp(Math.floor(y / this.cellSize), 0, this.rows - 1);
        return row * this.cols + col;
    }

    insert(object) {
        const index = this.indexOf(object.x, object.y);
        object[CELL] = index;
        this.cells[index].push(object);
    }

    remove(object) {
        const index = object[CELL];
        if (index === undefined) {
            return;
        }

        const cell = this.cells[index];
        const at = cell.indexOf(object);
        if (at !== -1) {
            cell.splice(at, 1);
        }
        object[CELL] = undefined;
    }

    // Перепривязывает объект, если он переехал в другую ячейку.
    update(object) {
        const index = this.indexOf(object.x, object.y);
        if (index === object[CELL]) {
            return;
        }

        this.remove(object);
        object[CELL] = index;
        this.cells[index].push(object);
    }

    // Полная пересборка — страховка от изменений координат в обход update().
    rebuild(objects) {
        for (const cell of this.cells) {
            cell.length = 0;
        }
        for (const object of objects) {
            this.insert(object);
        }
    }

    // Соседи lifer в радиусе radius (сам lifer не входит).
    collect(lifer, radius, out) {
        if (radius <= 0) {
            return out;
        }

        const radiusSquared = radius * radius;
        const minCol = clamp(Math.floor((lifer.x - radius) / this.cellSize), 0, this.cols - 1);
        const maxCol = clamp(Math.floor((lifer.x + radius) / this.cellSize), 0, this.cols - 1);
        const minRow = clamp(Math.floor((lifer.y - radius) / this.cellSize), 0, this.rows - 1);
        const maxRow = clamp(Math.floor((lifer.y + radius) / this.cellSize), 0, this.rows - 1);

        for (let row = minRow; row <= maxRow; row++) {
            const rowOffset = row * this.cols;

            for (let col = minCol; col <= maxCol; col++) {
                const cell = this.cells[rowOffset + col];

                for (let i = 0; i < cell.length; i++) {
                    const object = cell[i];
                    if (object === lifer) {
                        continue;
                    }

                    const dx = object.x - lifer.x;
                    const dy = object.y - lifer.y;
                    if (dx * dx + dy * dy < radiusSquared) {
                        out.push(object);
                    }
                }
            }
        }

        return out;
    }
}

function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
}
