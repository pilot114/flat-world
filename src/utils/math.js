// Геометрия. Модуль не зависит от DOM.

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

// Случайность живёт в utils/random.js и принадлежит миру: симуляция должна
// воспроизводиться, а глобальный Math.random повторить нельзя.
