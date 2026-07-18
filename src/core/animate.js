import { getNearest, getRange, randInt } from '../utils/math.js';

export const Anim = {
    RANDOM: 'random',
    PARTICLE: 'particle',
    CIRCLE: 'circle',
    CHASE: 'chase',
    ESCAPE: 'escape'
};

// Единственная задача animate — обновить координаты существа.
// name — тип движения (Anim), vector — точка притяжения/отталкивания.
// nears — список соседей; передаётся снаружи, чтобы не искать их дважды за тик.
export function animate(lifer, world, name, vector, nears = world.getNear(lifer)) {
    // физическое ограничение: нельзя сильно накладывать объекты друг на друга.
    // Список собран до decide(), поэтому съеденных в этом тике пропускаем.
    const nearest = getNearest(nears, lifer, isAlive);
    if (nearest && getRange(nearest, lifer) < lifer.radius) {
        name = Anim.ESCAPE;
        vector = { x: nearest.x, y: nearest.y };
    }

    switch (name) {
        case Anim.RANDOM:
            // для рандома удобнее сразу задавать угол
            setImpulseByAngle(lifer, randInt(0, 360));
            break;

        // используем информацию о текущем импульсе через сам объект: получаем и сохраняем
        case Anim.PARTICLE:
            if (lifer.dx === 0 && lifer.dy === 0) {
                setImpulseByAngle(lifer, randInt(0, 360));
            }
            break;

        case Anim.CIRCLE: {
            // параметрическое движение по окружности вокруг центра мира
            const radius = 150;
            const centerX = world.width / 2;
            const centerY = world.height / 2;

            // масштабируем тики до градусов и переводим в радианы
            const theta = (world.tick % 360) * (2 * Math.PI / 360);
            lifer.x = centerX + radius * Math.cos(theta);
            lifer.y = centerY - radius * Math.sin(theta);
            // дальнейшие действия для параметрического движения не нужны
            return;
        }

        case Anim.CHASE:
            setImpulseToPoint(lifer, vector, 1);
            break;

        case Anim.ESCAPE:
            setImpulseToPoint(lifer, vector, -1);
            break;

        default:
            lifer.dx = 0;
            lifer.dy = 0;
            break;
    }

    // отражаемся от границ мира
    if (lifer.x + lifer.dx >= world.width || lifer.x + lifer.dx <= 0) {
        lifer.dx = -lifer.dx;
    }
    if (lifer.y + lifer.dy >= world.height || lifer.y + lifer.dy <= 0) {
        lifer.dy = -lifer.dy;
    }

    lifer.x += lifer.dx;
    lifer.y += lifer.dy;
}

const isAlive = (object) => !object.removed;

function setImpulseByAngle(lifer, angle) {
    const radians = angle * (Math.PI / 180);
    lifer.dx = Math.cos(radians) * lifer.speed;
    lifer.dy = Math.sin(radians) * lifer.speed;
}

// direction: 1 — движемся к точке, -1 — от неё
function setImpulseToPoint(lifer, point, direction) {
    const dx = point.x - lifer.x;
    const dy = point.y - lifer.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    // объекты в одной точке — импульс не определён, оставляем как есть
    if (length === 0) {
        return;
    }

    lifer.dx = direction * (dx / length) * lifer.speed;
    lifer.dy = direction * (dy / length) * lifer.speed;
}
