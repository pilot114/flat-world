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

// Кадр из истории. palette — цвета по индексу типа,
// berserkBit в поле типа означает, что существо было чёрным.
export function drawSnapshot(context, frame, palette, berserkBit) {
    const { count, xs, ys, radii, types } = frame;

    for (let i = 0; i < count; i++) {
        const type = types[i];

        context.fillStyle = type & berserkBit ? 'black' : palette[type & (berserkBit - 1)];
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
