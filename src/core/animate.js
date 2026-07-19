import { getNearest, getRange } from '../utils/math.js';

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
//
// Возвращает движение, которое в итоге применилось: расталкивание соседей
// подменяет решение, а платит существо за то, что действительно делало.
export function animate(lifer, world, name, vector, nears = world.getNear(lifer)) {
    // физическое ограничение: нельзя сильно накладывать объекты друг на друга.
    // Список собран до decide(), поэтому съеденных в этом тике пропускаем.
    const nearest = getNearest(nears, lifer, isAlive);
    if (nearest && getRange(nearest, lifer) < lifer.radius) {
        name = Anim.ESCAPE;
        vector = { x: nearest.x, y: nearest.y };
    }

    // Движение по окружности — единственное параметрическое: оно само ставит
    // координаты и не проходит ни через импульс, ни через отражение от границ.
    // В общую таблицу оно не ложится, поэтому разбирается отдельно.
    if (name === Anim.CIRCLE) {
        moveByCircle(lifer, world);
        return name;
    }

    const setImpulse = IMPULSES[name];
    if (setImpulse) {
        setImpulse(lifer, vector, world);
    } else {
        lifer.dx = 0;
        lifer.dy = 0;
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

    return name;
}

// Тип движения -> как задать импульс. Само перемещение общее для всех:
// импульс отражается от границ мира и складывается с координатами.
// Случайность берётся у мира, а не у Math.random: только так прогон истории
// повторяет ту же траекторию, что была записана.
const IMPULSES = {
    // для рандома удобнее сразу задавать угол
    [Anim.RANDOM]: (lifer, vector, world) => setImpulseByAngle(lifer, world.random.int(0, 360)),

    // используем информацию о текущем импульсе через сам объект: получаем и сохраняем
    [Anim.PARTICLE]: (lifer, vector, world) => {
        if (lifer.dx === 0 && lifer.dy === 0) {
            setImpulseByAngle(lifer, world.random.int(0, 360));
        }
    },

    [Anim.CHASE]: (lifer, vector) => setImpulseToPoint(lifer, vector, 1),
    [Anim.ESCAPE]: (lifer, vector) => setImpulseToPoint(lifer, vector, -1)
};

const isAlive = (object) => !object.removed;

// Параметрическое движение по окружности вокруг центра мира.
function moveByCircle(lifer, world) {
    const radius = 150;
    const centerX = world.width / 2;
    const centerY = world.height / 2;

    // масштабируем тики до градусов и переводим в радианы
    const theta = (world.tick % 360) * (2 * Math.PI / 360);
    lifer.x = centerX + radius * Math.cos(theta);
    lifer.y = centerY - radius * Math.sin(theta);
}

// Шаг существа задаёт pace, а не speed: обессиленное движется медленнее,
// чем позволяет его вид.
function setImpulseByAngle(lifer, angle) {
    const radians = angle * (Math.PI / 180);
    lifer.dx = Math.cos(radians) * lifer.pace;
    lifer.dy = Math.sin(radians) * lifer.pace;
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

    lifer.dx = direction * (dx / length) * lifer.pace;
    lifer.dy = direction * (dy / length) * lifer.pace;
}
