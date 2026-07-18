// Геометрия и случайные числа. Модуль не зависит от DOM.

export function getRange(one, two) {
    return Math.sqrt(getRangeSquared(one, two));
}

// Квадрат расстояния: для сравнений корень не нужен.
export function getRangeSquared(one, two) {
    const dx = two.x - one.x;
    const dy = two.y - one.y;
    return dx * dx + dy * dy;
}

// Ближайший к obj элемент массива, либо null.
// predicate позволяет отобрать кандидатов без создания промежуточного массива.
export function getNearest(arr, obj, predicate) {
    let nearest = null;
    let nearestRange = Infinity;

    for (const candidate of arr) {
        if (predicate && !predicate(candidate)) {
            continue;
        }

        const range = getRangeSquared(candidate, obj);
        if (range < nearestRange) {
            nearest = candidate;
            nearestRange = range;
        }
    }

    return nearest;
}

// randInt(1, 10) -> число из диапазона
export function randInt(min, max) {
    return Math.floor(min + Math.random() * (max + 1 - min));
}

// randOf(['a', 'b']) -> случайный элемент
export function randOf(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Генератор случайных координат внутри прямоугольника мира.
export function randCoordGenerate(maxWidth, maxHeight) {
    return function () {
        return [
            Math.floor(Math.random() * maxWidth) + 1,
            Math.floor(Math.random() * maxHeight) + 1
        ];
    };
}
