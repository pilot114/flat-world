// Математика графика: шкалы, деления осей, путь по точкам.
// Модуль не зависит от DOM — поэтому тестируется в Node вместе с ядром.

// Геометрические середины между 1, 2, 5 и 10 на логарифмической шкале.
// По ним выбирается множитель шага: округляем к ближайшему круглому
// значению, а не всегда вверх — иначе шаг 12 превращался бы в 20 вместо 10.
const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

const TICK_COUNT = 10;

// Линейная шкала из [0, max] в пиксели [from, to].
// Обратный отсчёт задаётся порядком: у оси Y from — низ, to — верх.
export function linearScale(max, from, to) {
  const span = max || 1;
  return (value) => from + (value / span) * (to - from);
}

// Круглый шаг делений: примерно count штук на диапазон.
export function tickStep(max, count = TICK_COUNT) {
  const raw = (max || 1) / count;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const error = raw / power;
  const mult = error >= E10 ? 10 : error >= E5 ? 5 : error >= E2 ? 2 : 1;

  return power * mult;
}

// Верх оси, округлённый до кратного шагу делений.
// Округлять до 1/2/5×10ⁿ было бы грубее: 112 дало бы 200 вместо 120.
//
// Округляем в несколько заходов: подняв верх, мы расширили диапазон, и шаг
// делений мог смениться — тогда прежний верх ему уже не кратен. Так, 31
// с шагом 2 даёт 32, но для 32 шаг уже 5, и последнее деление вышло бы на 30,
// не достав до верха оси. Повторяем, пока шаг не устоится.
export function niceMax(value, count = TICK_COUNT) {
  if (value <= 0) {
    return 1;
  }

  let top = value;
  let previous = null;

  // заходов нужно два-три; предел — страховка от зацикливания
  for (let i = 0; i < 10; i++) {
    const step = tickStep(top, count);
    if (step === previous) {
      break;
    }

    previous = step;
    // допуск съедает хвосты вида 10.000000000000002, иначе значение,
    // уже кратное шагу, поднималось бы на лишнее деление
    top = clean(Math.ceil(top / step - 1e-9) * step);
  }

  return top;
}

// Значения делений от нуля до max включительно.
export function ticks(max, count = TICK_COUNT) {
  const step = tickStep(max, count);
  const out = [];

  // считаем от индекса, а не накоплением: сложение дробных шагов уплывает
  for (let i = 0; i * step <= max + step * 1e-9; i++) {
    out.push(clean(i * step));
  }

  return out;
}

// Путь SVG по значениям: x получает индекс точки, y — само значение.
export function linePath(values, x, y) {
  let d = '';

  for (let i = 0; i < values.length; i++) {
    d += (i === 0 ? 'M' : 'L') + x(i) + ',' + y(values[i]);
  }

  return d;
}

// Умножение на дробный шаг оставляет хвосты вроде 1.0000000000000002 —
// в подписи оси такое попадать не должно.
function clean(value) {
  return Number(value.toFixed(10));
}
