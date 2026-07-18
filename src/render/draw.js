// Примитивы отрисовки на canvas. Работают с любым 2d-контекстом.

export function drawCircle(context, lifer, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(lifer.x, lifer.y, lifer.radius, 0, Math.PI * 2);
    context.closePath();
    context.fill();
}

// Окружность радиуса обзора — тонкая линия вокруг существа.
export function drawViewCircle(context, lifer) {
    context.beginPath();
    context.arc(lifer.x, lifer.y, lifer.radiusView, 0, Math.PI * 2);
    context.lineWidth = 0.1;
    context.closePath();
    context.stroke();
}

export function drawSelectLabel(context, lifer, text) {
    context.fillStyle = '#444444';
    context.font = 'normal normal 14px Helvetica';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillText(text, lifer.x, lifer.y + 20);
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
export function drawSelection(context, lifer) {
    if (lifer.radiusView > 0) {
        drawViewCircle(context, lifer);
    }
    drawSelectLabel(context, lifer, 'id:' + lifer.id);
}

// Что рисовать поверх кадра истории, решает мир (world.selectionInFrame):
// координаты берутся из кадра, а не у живого существа. Отрисовке достаточно
// того же drawSelection — она не отличает живое существо от записи в кадре.
