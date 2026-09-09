import { BERSERK_COLOR, Flag, createLifer, liferColor, liferTypes } from './core/species.js';
import { HISTORY_EVERY, World } from './core/world.js';
import { drawSelection, drawSnapshot } from './render/draw.js';
import { getEventLocation } from './utils/dom.js';
import { SCENARIOS } from './scenarios.js';
import { clear as clearSaved, load as loadSaved, save as saveWorld } from './utils/store.js';
import { Graph } from './ui/graph.js';
import { InfoPanel } from './ui/infoPanel.js';
import { Player } from './ui/player.js';
import { ERASER, SpeciesPanel } from './ui/speciesPanel.js';
import { StatePanel } from './ui/statePanel.js';
import { Tabs } from './ui/tabs.js';

const WIDTH = 1000;
const HEIGHT = 500;
const FPS = 60;

// Песочницу собирают руками, и терять её при перезагрузке обидно —
// в отличие от сценариев, которые пересобираются из описания за миг.
const SAVED = 'flatworld.sandbox';
// Как часто сохранять: чаще незачем, а localStorage пишется синхронно.
const SAVE_EVERY = 3000;

function main() {
    const canvas = document.getElementById('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext('2d');

    const info = new InfoPanel({ worldId: 'worldInfo', selectId: 'selectInfo' });

    const state = new StatePanel({
        panelId: 'statePanel',
        memoryId: 'memoryInfo',
        frameId: 'stateFrame',
        frameLabelId: 'stateFrameLabel',
        idId: 'stateId',
        idLabelId: 'stateIdLabel',
        infoId: 'stateInfo'
    });
    // цвета по индексу типа — в кадре истории тип хранится числом
    const palette = liferTypes().map(liferColor);
    // берсерк перекрашивается на время режима, поэтому в истории цвет
    // определяет не только вид: состояние важнее
    const colorOf = (type, flags) => (flags & Flag.BERSERK ? BERSERK_COLOR : palette[type]);

    const player = new Player(
        { sliderId: 'timeline', labelId: 'playerLabel', speedId: 'speed' },
        {
            // бросок ползунка останавливает время: иначе показанный кадр
            // тут же убежал бы из-под руки
            onSeek: (position) => {
                player.stop();
                player.setPosition(position);
            }
        }
    );

    // Правая колонка: статистика по ходу симуляции или то, что лежит
    // в истории. Обе смотрят на один мир, поэтому переключаются показом,
    // а не пересборкой.
    const stats = document.getElementById('statsPanel');
    new Tabs('sideTabs', [
        { id: 'stats', name: 'статистика' },
        { id: 'state', name: 'состояние' }
    ], (item) => {
        stats.classList.toggle('hidden', item.id !== 'stats');
        state.setOpen(item.id === 'state');
    }).select('stats');

    // Смена вкладки пересобирает мир, список видов и график целиком,
    // поэтому цикл отрисовки и обработчик кликов читают текущую сессию
    // через ссылку, а не захватывают её при старте.
    let session = null;
    const scenarioInfo = document.getElementById('scenarioInfo');
    const forget = document.getElementById('forget');
    const tabs = new Tabs('tabs', SCENARIOS, (scenario) => {
        scenarioInfo.textContent = scenario.description;
        session = startScenario(scenario, player);
        forget.classList.toggle('hidden', !session.sandbox);
    });
    tabs.select(SCENARIOS[0].id);

    // Забыть сохранённую песочницу и начать её заново. Кнопка живёт рядом
    // с каталогом и в прочих сценариях прячется — забывать там нечего.
    forget.addEventListener('click', () => {
        clearSaved(SAVED);
        tabs.select('sandbox');
    });

    // Клик по канвасу: с выбранным типом — подселяем существо,
    // без выбора — выделяем ближайшее.
    canvas.addEventListener('click', (event) => {
        const location = getEventLocation(canvas, event);
        const { world } = session;

        const chosen = session.species.selected;

        if (chosen === ERASER) {
            world.erase(location.x, location.y);
            return;
        }
        if (chosen) {
            // через place, а не add: подселение — вмешательство извне,
            // и без записи в журнал прогон истории его не повторит
            world.place(chosen, location.x, location.y);
            return;
        }

        // при перемотке на канвасе прошлое — целимся в тех, кто был жив тогда
        if (player.position !== null) {
            world.selectByLocationAt(viewedTick(world, player), location);
        } else {
            world.selectByLocation(location);
        }

        // дебаг смотрит на то же существо, что и панель выделения
        state.follow(world.selectId);
    });

    startLoop({ context, info, state, player, colorOf, getSession: () => session });
}

// Кадр, который сейчас на канвасе, или null в живом режиме.
//
// Позиция дробная: между записанными кадрами десять тиков, и показывать
// только их значило бы шесть картинок в секунду вместо шестидесяти.
// Промежуточные достраиваются интерполяцией.
function viewedFrame(world, player) {
    if (player.position === null) {
        return null;
    }

    const index = Math.floor(player.position);
    return world.history.tween(index, player.position - index);
}

// Тик показанного кадра — по нему берётся состояние того момента.
function viewedTick(world, player) {
    return world.history.tickAt(Math.floor(player.position));
}

// Собирает мир сценария вместе с его списком видов и графиком.
function startScenario(scenario, player) {
    // виды сценария — ключи setup: их и показываем в списке и на графике.
    // Песочница начинается пустой, поэтому перечисляет виды сама
    const types = scenario.types ?? Object.keys(scenario.setup);
    const sandbox = scenario.id === 'sandbox';
    const world = new World(WIDTH, HEIGHT);

    // Песочница поднимается с того места, где её оставили. Сохранённый слепок
    // разворачивается вместо заселения — журнал и история при этом начинаются
    // заново, прошлое прежнего сеанса показать всё равно нечем.
    const saved = sandbox ? loadSaved(SAVED) : null;
    if (saved) {
        world.loadSnapshot(saved);
        world.journalCursor = 0;
    }

    for (const [type, count] of Object.entries(saved ? {} : scenario.setup)) {
        world.populate(type, count);
    }
    for (const [type, chance] of Object.entries(scenario.spawn || {})) {
        world.setSpawnRate(type, chance);
    }
    world.refreshCounts();

    world.matchEnds = scenario.finish !== false;
    world.breeding = scenario.breeding === true;

    // матч закончился — останавливаем ход времени, но перемотку оставляем.
    // Модальный alert здесь не годится: он замораживает вкладку целиком.
    world.onFinish = (winner) => {
        player.stop();
        player.announce(winner + ' победил');
    };

    player.reset();
    // сценарий может попросить открыться на паузе — так делает песочница
    if (scenario.speed === 0) {
        player.stop();
    }

    return {
        world,
        sandbox,
        species: new SpeciesPanel('species', types, { eraser: sandbox }),
        graph: new Graph('#graph', world, types),
        // время жизни мира без учёта пауз — иначе простой занижает расчётный fps
        elapsed: 0
    };
}

function startLoop({ context, info, state, player, colorOf, getSession }) {
    const step = 1000 / FPS;
    // Больше пяти шагов за кадр не догоняем: после сворачивания вкладки
    // накопленный долг иначе выльется в рывок. Порог растёт вместе со
    // скоростью — на x10 десять шагов за кадр это норма, а не долг.
    const MAX_STEPS = 5;

    let last = performance.now();
    let savedAt = 0;
    // долг перед живым миром считается в миллисекундах, перед историей —
    // в кадрах: у них разный шаг, и общий счётчик пришлось бы всё время делить
    let debt = 0;
    let frameDebt = 0;

    // Цикл не останавливается никогда: на паузе и при перемотке
    // мир не обновляется, но кадр всё равно нужно перерисовать.
    (function frame() {
        requestAnimationFrame(frame);

        const session = getSession();
        const { world, species, graph } = session;

        const now = performance.now();
        const delta = now - last;
        last = now;

        const speed = player.speed;
        // доля пути до следующего тика: на медленной скорости кадров отрисовки
        // приходится больше, чем тиков, и без неё существа стояли бы на месте,
        // а потом прыгали — та же рваность, что была у истории без
        // промежуточных кадров
        let part = 0;

        if (speed > 0 && player.position === null && !world.stopped) {
            // Живой мир: шаг фиксирован, ttl и скорости заданы в тиках, поэтому
            // частота симуляции не должна зависеть от герцовки экрана.
            // Ускорение меняет не длину шага, а число шагов на секунду.
            const maxSteps = Math.ceil(MAX_STEPS * speed);
            debt += delta * speed;

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
            part = debt / step;
            frameDebt = 0;
        } else if (speed !== 0 && world.history.length > 0) {
            // Ход по записанному: назад — всегда, вперёд — когда мы отстали
            // от настоящего или мир уже остановлен. Мир вспять не считается,
            // но кадры записаны, и двигаться по ним можно в обе стороны.
            //
            // Позиция дробная: за кадр отрисовки при ×1 проходит десятая доля
            // записанного кадра, и показывать надо именно её, а не ждать,
            // пока накопится целый.
            if (player.position === null) {
                player.setPosition(world.history.length - 1);
            }

            const newest = world.history.length - 1;
            const moved = player.position + delta * speed / step / HISTORY_EVERY;

            // догнали настоящее — возвращаемся к живому миру
            if (moved >= newest && speed > 0 && !world.stopped) {
                player.setPosition(null);
            } else {
                player.setPosition(Math.max(0, Math.min(newest, moved)));
            }
            debt = 0;
        }

        context.clearRect(0, 0, world.width, world.height);

        const viewed = viewedFrame(world, player);
        // при перемотке выделенное существо берётся из восстановленного
        // состояния того момента: и пометка, и поля панели — «тогда», а не «сейчас»
        const selected = viewed ? world.selectionFor(viewedTick(world, player)) : world.select;

        if (viewed) {
            drawSnapshot(context, viewed, colorOf);
            if (selected) {
                // круг ставим по промежуточному кадру, иначе он дёргался бы
                // раз в десять тиков, пока существа едут плавно
                drawSelection(context, { ...selected, ...positionIn(viewed, selected.id) });
            }
        } else {
            world.draw(context, drawSelection, part);
        }

        // песочницу сохраняем не каждый кадр: localStorage пишется синхронно
        if (session.sandbox && now - savedAt > SAVE_EVERY) {
            savedAt = now;
            saveWorld(SAVED, world.captureSnapshot());
        }

        info.render(world, selected);
        state.render(world);

        // счётчики и график идут по записанным кадрам: доли между ними
        // им не нужны, и дробную позицию для них округляем
        const index = viewed ? Math.floor(player.position) : null;
        species.render(viewed ? world.history.countsAt(index) : world.getCounts());
        player.render(world.history.length, viewed ? viewedTick(world, player) : world.tick);
        graph.render(world.history, index);
    })();
}

// Где существо стоит в показанном кадре: у промежуточного кадра координаты
// свои, а у выделенного объекта — те, что были на записанном тике.
function positionIn(frame, id) {
    for (let i = 0; i < frame.count; i++) {
        if (frame.ids[i] === id) {
            return { x: frame.xs[i], y: frame.ys[i] };
        }
    }
    return {};
}

window.addEventListener('load', main);
