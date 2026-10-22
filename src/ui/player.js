// Управление воспроизведением: пауза, скорость и перемотка по записанным кадрам.
// Живой режим — position === null, иначе показываем кадр истории.

// Множители скорости — ряд переключателей, а не ползунок: значений немного,
// шаг между ними неравномерный, и видеть их все сразу полезнее, чем угадывать
// положение движка.
//
// Ряд симметричен и проходит через ноль. Отрицательная скорость — это ход
// назад по записанной истории: сам мир вспять считать нельзя, но кадры уже
// записаны, и двигаться по ним можно в обе стороны. Ноль в этом ряду и есть
// пауза; отдельной кнопки нет, иначе остановить время можно было бы двумя
// способами, и на паузе со скоростью ×4 стало бы непонятно, что показано.
const SPEEDS = [-10, -1, -0.2, 0, 0.2, 1, 10];
const NORMAL_SPEED = SPEEDS.indexOf(1);
const STOPPED = SPEEDS.indexOf(0);

export class Player {
  constructor({ sliderId, labelId, speedId }, { onSeek }) {
    this.slider = document.getElementById(sliderId);
    this.label = document.getElementById(labelId);

    this.position = null;
    // куда вернуться с нуля: скорость, на которой время шло в прошлый раз
    this.resumeIndex = NORMAL_SPEED;
    this.frames = 0;
    this.result = null;
    this.speed = 1;

    // перемотка сама по себе означает паузу — иначе кадр тут же убежит
    this.slider.addEventListener('input', () => onSeek(Number(this.slider.value)));

    this.buttons = SPEEDS.map((speed, index) => this.addSpeed(speedId, speed, index));
    this.setSpeed(NORMAL_SPEED);
  }

  addSpeed(speedId, speed, index) {
    const label = document.createElement('label');
    // ноль помечаем классом, а не местом в ряду: набор скоростей меняется,
    // и привязка стиля к индексу разъехалась бы молча
    label.className = speed === 0 ? 'chip stop' : 'chip';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'speed';
    input.value = String(index);
    input.addEventListener('change', () => this.setSpeed(index));

    const text = document.createElement('span');
    // множитель без «×»: рядом стоит подпись «скорость», и знак в каждой
    // из одиннадцати кнопок только съедал бы ширину у ползунка
    text.textContent = String(speed);

    label.append(input, text);
    document.getElementById(speedId).appendChild(label);
    return input;
  }

  // Остановить время — это выбрать ноль в том же ряду.
  stop() {
    this.setSpeed(STOPPED);
  }

  play() {
    this.setSpeed(this.resumeIndex);
  }

  // index — место в ряду SPEEDS, а не сам множитель
  setSpeed(index) {
    this.speedIndex = index;
    this.speed = SPEEDS[index];

    if (this.speed !== 0) {
      this.resumeIndex = index;
    }

    this.buttons[index].checked = true;
  }

  // Идёт ли время.
  get running() {
    return this.speed !== 0;
  }

  // position === null — живой режим, ползунок стоит в конце
  // Позиция дробная: между записанными кадрами есть промежуточные,
  // достроенные интерполяцией. Ползунку дробь не нужна — он о кадрах.
  setPosition(position) {
    this.position = position;
    if (position !== null) {
      this.slider.value = String(Math.round(position));
    }
  }

  // Итог матча показываем в интерфейсе, а не модальным окном.
  announce(result) {
    this.result = result;
  }

  // Новый сценарий — новый мир: истории ещё нет, итога прошлого матча тоже.
  // Скорость не трогаем: её выбрали для просмотра, а не для конкретного мира.
  reset() {
    this.position = null;
    this.result = null;
    // -1 заставит render перестроить ползунок под пустую историю
    this.frames = -1;

    // Новый сценарий всегда идёт вперёд: прошлого у него ещё нет,
    // и на нуле или обратном ходе он замер бы навсегда. Положительный
    // множитель при этом сохраняется — его выбирают под просмотр.
    if (this.speed <= 0) {
      this.setSpeed(this.resumeIndex > STOPPED ? this.resumeIndex : NORMAL_SPEED);
    }
  }

  // frames — сколько кадров сейчас в истории
  render(frames, tick) {
    if (frames !== this.frames) {
      this.frames = frames;
      this.slider.max = String(Math.max(0, frames - 1));
      this.slider.disabled = frames === 0;
    }

    if (this.position !== null) {
      this.label.textContent = `кадр ${Math.floor(this.position) + 1} из ${frames} · тик ${tick}`;
      return;
    }

    this.slider.value = this.slider.max;
    this.label.textContent = this.result ? `${this.result} · тик ${tick}` : 'живой режим · тик ' + tick;
  }
}
