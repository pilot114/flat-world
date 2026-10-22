import { typeByIndex } from '../core/species.js';
import { storedIdRange, storedRow, storedWorld } from '../core/world.js';
import { objectToString } from '../utils/dom.js';
import { formatByteSize } from '../utils/memory.js';

// Вкладка «состояние»: что именно лежит в истории и во что она обходится.
//
// Два ползунка, потому что у состояния две координаты. Первый выбирает
// ключевой кадр — момент, на который снят слепок. Второй выбирает существо
// по id; id выдаются подряд, поэтому ползунок от 1 до nextId - 1 перебирает
// вообще всех, кто когда-либо жил в этом мире, включая давно съеденных.
//
// Значения показываются как записаны, без округления: смысл панели в том,
// чтобы видеть настоящее содержимое буфера, а не его причёсанный пересказ.
export class StatePanel {
  constructor({ panelId, memoryId, frameId, frameLabelId, idId, idLabelId, infoId }) {
    this.panel = document.getElementById(panelId);
    this.memory = document.getElementById(memoryId);
    this.frame = document.getElementById(frameId);
    this.frameLabel = document.getElementById(frameLabelId);
    this.id = document.getElementById(idId);
    this.idLabel = document.getElementById(idLabelId);
    this.info = document.getElementById(infoId);

    this.open = false;
    this.shown = null;
    this.shownMemory = null;
    this.id.value = '1';
    // сколько кадров и id было в прошлый раз: диапазоны ползунков
    // трогаем только когда они правда изменились
    this.frames = -1;
    this.ids = -1;

    // ползунки только выбирают, что показать: перерисовка идёт из цикла
    this.frame.addEventListener('input', () => {
      this.shown = null;
    });
    this.id.addEventListener('input', () => {
      this.shown = null;
    });
  }

  // Вкладку показывает и прячет полоска сверху; скрытая ничего не считает.
  setOpen(open) {
    this.open = open;
    this.panel.classList.toggle('hidden', !open);
    this.shown = null;
    this.shownMemory = null;
  }

  // Выбрать существо снаружи — панель выделения и дебаг смотрят на одно и то же.
  follow(id) {
    if (id > 0) {
      this.id.value = String(id);
      this.shown = null;
    }
  }

  render(world) {
    if (!this.open) {
      return;
    }

    this.renderMemory(world);
    this.syncRanges(world);

    const index = Number(this.frame.value);
    const keyframe = world.keyframes[index];
    // ползунок не должен уводить за пределы выданных id
    const id = Math.max(1, Math.min(Number(this.id.value), Math.max(1, world.nextId - 1)));

    if (!keyframe) {
      this.show('ключевых кадров ещё нет');
      return;
    }

    this.frameLabel.textContent = `${index + 1} из ${world.keyframes.length} · тик ${keyframe.tick}`;
    this.idLabel.textContent = `${id} из ${Math.max(1, world.nextId - 1)}`;

    this.show(['МИР', rows(storedWorld(keyframe)), '', 'СУЩЕСТВО id ' + id, this.lifer(keyframe, id)].join('\n'));
  }

  lifer(keyframe, id) {
    const row = storedRow(keyframe, id);
    if (row) {
      return rows(row);
    }
    return 'в этом кадре его нет';
  }

  // Во что обходится история. Строка про временный кэш появляется только
  // когда он есть, то есть во время просмотра прошлого.
  renderMemory(world) {
    const fields = {
      кадров: world.history.length,
      'ключевых кадров': world.keyframes.length,
      история: formatByteSize(world.historyBytes),
    };

    const cache = world.cacheBytes;
    if (cache > 0) {
      fields['кэш перемотки'] = '~' + formatByteSize(cache);
    }

    const text = objectToString(fields);
    if (text !== this.shownMemory) {
      this.memory.innerText = text;
      this.shownMemory = text;
    }
  }

  // Диапазоны ползунков растут вместе с миром. Позицию при этом не трогаем:
  // иначе выбранный кадр уезжал бы под руками на каждом новом ключевом кадре.
  syncRanges(world) {
    const frames = world.keyframes.length;
    const ids = Math.max(1, world.nextId - 1);

    if (frames !== this.frames) {
      this.frames = frames;
      this.frame.max = String(Math.max(0, frames - 1));
      this.frame.disabled = frames === 0;
    }
    if (ids !== this.ids) {
      this.ids = ids;
      this.id.max = String(ids);
    }
  }

  show(text) {
    if (text !== this.shown) {
      this.info.innerText = text;
      this.shown = text;
    }
  }
}

// Строки вида «имя значение тип». Вид расшифровываем: индекс в реестре
// сам по себе ничего не говорит.
function rows(fields) {
  const width = Math.max(...fields.map((field) => field.name.length));

  return fields
    .map((field) => {
      const hint = field.name === 'type' ? ' (' + typeByIndex(field.value) + ')' : '';
      const type = field.type ? ' ' + field.type : '';
      return `${field.name.padEnd(width)} ${field.value}${type}${hint}`;
    })
    .join('\n');
}
