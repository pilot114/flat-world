import { createLifer, liferColor, liferTypes } from './core/lifers.js';
import { BERSERK_BIT, World } from './core/world.js';
import { drawSelection, drawSnapshot } from './render/draw.js';
import { getEventLocation } from './utils/dom.js';
import { Graph } from './ui/graph.js';
import { InfoPanel } from './ui/infoPanel.js';
import { Player } from './ui/player.js';
import { SpeciesPanel } from './ui/speciesPanel.js';

const WIDTH = 1000;
const HEIGHT = 500;
const FPS = 60;

// Начальное население мира: тип -> количество.
const SETUP = {
    Grass: 100,
    Cow: 100,
    Wolf: 10,
    Ghost: 20,

    Stone: 200,
    Clip: 200,
    Paper: 200
};

// Трава не размножается сама — без подсева коровы съедят её за десяток секунд
// и травоядная цепочка вымрет.
const SPAWN = {
    Grass: 0.05
};

function main() {
    const canvas = document.getElementById('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');

    const world = new World(WIDTH, HEIGHT);
    for (const [type, count] of Object.entries(SETUP)) {
        world.populate(type, count);
    }
    for (const [type, chance] of Object.entries(SPAWN)) {
        world.setSpawnRate(type, chance);
    }
    world.refreshCounts();

    const species = new SpeciesPanel('species');
    const info = new InfoPanel('worldInfo', 'selectInfo');
    const graph = new Graph('#graph', world);
    // цвета по индексу типа — в кадре истории тип хранится числом
    const palette = liferTypes().map(liferColor);

    const player = new Player(
        { buttonId: 'playPause', sliderId: 'timeline', labelId: 'playerLabel' },
        {
            onToggle: () => {
                const paused = !player.paused;
                player.setPaused(paused);
                // снятие паузы всегда возвращает к живому миру
                if (!paused) {
                    player.setPosition(null);
                }
            },
            onSeek: (position) => {
                player.setPaused(true);
                player.setPosition(position);
            }
        }
    );
    player.setPaused(false);

    // матч закончился — останавливаем ход времени, но перемотку оставляем.
    // Модальный alert здесь не годится: он замораживает вкладку целиком.
    world.onFinish = (winner) => {
        player.setPaused(true);
        player.announce(winner + ' победил');
    };

    // Клик по канвасу: с выбранным типом — подселяем существо,
    // без выбора — выделяем ближайшее.
    canvas.addEventListener('click', (event) => {
        const location = getEventLocation(canvas, event);

        if (species.selected) {
            world.add(createLifer(species.selected, location.x, location.y));
        } else {
            world.selectByLocation(location);
        }
    });

    startLoop({ world, context, info, species, player, graph, palette });
}

function startLoop({ world, context, info, species, player, graph, palette }) {
    const step = 1000 / FPS;
    // Больше пяти шагов за кадр не догоняем: после сворачивания вкладки
    // накопленный долг иначе выльется в рывок.
    const MAX_STEPS = 5;

    let last = performance.now();
    let debt = 0;
    // время жизни мира без учёта пауз — иначе простой занижает расчётный fps
    let elapsed = 0;

    // Цикл не останавливается никогда: на паузе и при перемотке
    // мир не обновляется, но кадр всё равно нужно перерисовать.
    (function frame() {
        requestAnimationFrame(frame);

        const now = performance.now();
        const delta = now - last;
        last = now;

        // Шаг мира фиксирован: ttl и скорости заданы в тиках, поэтому частота
        // симуляции не должна зависеть от герцовки экрана.
        const live = !player.paused && !world.stopped;
        if (live) {
            debt += delta;
            let steps = 0;
            while (debt >= step && steps < MAX_STEPS) {
                elapsed += step;
                world.update(elapsed);
                debt -= step;
                steps++;
            }
            if (steps === MAX_STEPS) {
                debt = 0;
            }
        }

        context.clearRect(0, 0, world.width, world.height);

        const viewed = player.position === null ? null : world.history[player.position];
        if (viewed) {
            drawSnapshot(context, viewed, palette, BERSERK_BIT);
        } else {
            world.draw(context, drawSelection);
        }

        info.render(world);
        // при перемотке счётчики берём из того же кадра, что канвас и график
        species.render(viewed ? viewed.counts : world.getCounts());
        player.render(world.history.length, viewed ? viewed.tick : world.tick);
        graph.render(world.history, player.position);
    })();
}

window.addEventListener('load', main);
