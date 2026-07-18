// Рисует отрезок из точки xy длиной size под углом angle (в градусах), возвращает координаты конца
function drawLine(context, xy, size, angle)
{
    const x = parseInt(xy[0], 10);
    const y = parseInt(xy[1], 10);

    const xy2 = [
        x + Math.sin(Math.PI * angle / 180.0) * size,
        y + Math.cos(Math.PI * angle / 180.0) * size
    ];

    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(xy2[0], xy2[1]);
    context.stroke();

    return xy2;
}
