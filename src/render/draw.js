// Примитивы отрисовки на canvas. Работают с любым 2d-контекстом.

// part — доля пути до следующего тика, от 0 до 1.
//
// Мир считается целыми тиками, но кадров отрисовки бывает больше: на медленной
// скорости тик приходится на несколько кадров, и без этого сдвига существо
// стояло бы на месте, а потом прыгало. Смещаем его по собственному импульсу —
// он и есть то, на сколько существо сдвинется в следующем тике.
function pointOf(lifer, part) {
  return {
    x: lifer.x + (lifer.dx || 0) * part,
    y: lifer.y + (lifer.dy || 0) * part,
  };
}

export function drawCircle(context, lifer, color, part = 0) {
  const { x, y } = pointOf(lifer, part);

  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, lifer.radius, 0, Math.PI * 2);
  context.closePath();
  context.fill();
}

// Окружность радиуса обзора — тонкая линия вокруг существа.
export function drawViewCircle(context, lifer, part = 0) {
  const { x, y } = pointOf(lifer, part);

  context.beginPath();
  context.arc(x, y, lifer.radiusView, 0, Math.PI * 2);
  context.lineWidth = 0.1;
  context.closePath();
  context.stroke();
}

export function drawSelectLabel(context, lifer, text, part = 0) {
  const { x, y } = pointOf(lifer, part);

  context.fillStyle = '#444444';
  context.font = 'normal normal 14px Helvetica';
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  context.fillText(text, x, y + 20);
}

// Кадр из истории. colorOf(type, flags) отдаёт цвет по индексу вида и его
// состоянию — какие бывают состояния, отрисовке знать незачем.
export function drawSnapshot(context, frame, colorOf) {
  const { count, xs, ys, radii, types, flags } = frame;

  for (let i = 0; i < count; i++) {
    context.fillStyle = colorOf(types[i], flags[i]);
    context.beginPath();
    context.arc(xs[i], ys[i], radii[i], 0, Math.PI * 2);
    context.closePath();
    context.fill();
  }
}

// Пометки выделенного существа: подпись и его радиус обзора.
export function drawSelection(context, lifer, part = 0) {
  if (lifer.radiusView > 0) {
    drawViewCircle(context, lifer, part);
  }
  drawSelectLabel(context, lifer, 'id:' + lifer.id, part);
}

// Что рисовать поверх кадра истории, решает мир (world.selectionInFrame):
// координаты берутся из кадра, а не у живого существа. Отрисовке достаточно
// того же drawSelection — она не отличает живое существо от записи в кадре.
