import { createLifer, liferColor, liferTypes } from './core/lifers.js';
import { BERSERK_BIT, World } from './core/world.js';
import { drawSelection, drawSnapshot } from './render/draw.js';
import { getEventLocation } from './utils/dom.js';
import { SCENARIOS } from './scenarios.js';
import { Graph } from './ui/graph.js';
import { InfoPanel } from './ui/infoPanel.js';
import { Player } from './ui/player.js';
import { SpeciesPanel } from './ui/speciesPanel.js';
import { Tabs } from './ui/tabs.js';

const WIDTH = 1000;
const HEIGHT = 500;
const FPS = 60;

function main() {
    const canvas = document.getElementById('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');

    const info = new InfoPanel('worldInfo', 'selectInfo', 'selectTabs');
    // цвета по индексу типа — в кадре истории тип хранится числом
    const palette = liferTypes().map(liferColor);

    const player = new Player(
        {
            buttonId: 'playPause',
            sliderId: 'timeline',
            labelId: 'playerLabel',
            speedId: 'speed',
            speedLabelId: 'speedLabel'
        },
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

    // Смена вкладки пересобирает мир, список видов и график целиком,
    // поэтому цикл отрисовки и обработчик кликов читают текущую сессию
    // через ссылку, а не захватывают её при старте.
    let session = null;
    const tabs = new Tabs('tabs', SCENARIOS, (scenario) => {
        session = startScenario(scenario, player);
    });
    tabs.select(SCENARIOS[0].id);

    // Клик по канвасу: с выбранным типом — подселяем существо,
    // без выбора — выделяем ближайшее.
    canvas.addEventListener('click', (event) => {
        const location = getEventLocation(canvas, event);

        if (session.species.selected) {
            session.world.add(createLifer(session.species.selected, location.x, location.y));
        } else {
            session.world.selectByLocation(location);
        }
    });

    startLoop({ context, info, player, palette, getSession: () => session });
}

// Собирает мир сценария вместе с его списком видов и графиком.
function startScenario(scenario, player) {
    // виды сценария — ключи setup: их и показываем в списке и на графике
    const types = Object.keys(scenario.setup);
    const world = new World(WIDTH, HEIGHT);

    for (const [type, count] of Object.entries(scenario.setup)) {
        world.populate(type, count);
    }
    for (const [type, chance] of Object.entries(scenario.spawn || {})) {
        world.setSpawnRate(type, chance);
    }
    world.refreshCounts();

    // матч закончился — останавливаем ход времени, но перемотку оставляем.
    // Модальный alert здесь не годится: он замораживает вкладку целиком.
    world.onFinish = (winner) => {
        player.setPaused(true);
        player.announce(winner + ' победил');
    };

    player.reset();

    return {
        world,
        species: new SpeciesPanel('species', types),
        graph: new Graph('#graph', world, types),
        // время жизни мира без учёта пауз — иначе простой занижает расчётный fps
        elapsed: 0
    };
}

function startLoop({ context, info, player, palette, getSession }) {
    const step = 1000 / FPS;
    // Больше пяти шагов за кадр не догоняем: после сворачивания вкладки
    // накопленный долг иначе выльется в рывок. Порог растёт вместе со
    // скоростью — на x10 десять шагов за кадр это норма, а не долг.
    const MAX_STEPS = 5;

    let last = performance.now();
    let debt = 0;

    // Цикл не останавливается никогда: на паузе и при перемотке
    // мир не обновляется, но кадр всё равно нужно перерисовать.
    (function frame() {
        requestAnimationFrame(frame);

        const session = getSession();
        const { world, species, graph } = session;

        const now = performance.now();
        const delta = now - last;
        last = now;

        // Шаг мира фиксирован: ttl и скорости заданы в тиках, поэтому частота
        // симуляции не должна зависеть от герцовки экрана. Ускорение меняет
        // не длину шага, а число шагов на секунду реального времени.
        const live = !player.paused && !world.stopped;
        if (live) {
            const maxSteps = Math.ceil(MAX_STEPS * player.speed);
            debt += delta * player.speed;

            let steps = 0;
            while (debt >= step && steps < maxSteps) {
                session.elapsed += step;
                world.update(session.elapsed);
                debt -= step;
                steps++;
            }
            if (steps === maxSteps) {
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
