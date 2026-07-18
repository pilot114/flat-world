// Управление воспроизведением: пауза, скорость и перемотка по записанным кадрам.
// Живой режим — position === null, иначе показываем кадр истории.

// Множители скорости. Ползунок ходит по индексам, а не по самим значениям:
// шаг у медленного и быстрого конца шкалы разный, а линейный ряд до x10
// отдал бы половину хода диапазону, в котором ничего не разглядеть.
const SPEEDS = [0.25, 0.5, 1, 2, 4, 6, 8, 10];
const NORMAL_SPEED = SPEEDS.indexOf(1);

export class Player {
    constructor({ buttonId, sliderId, labelId, speedId, speedLabelId }, { onToggle, onSeek }) {
        this.button = document.getElementById(buttonId);
        this.slider = document.getElementById(sliderId);
        this.label = document.getElementById(labelId);
        this.speedSlider = document.getElementById(speedId);
        this.speedLabel = document.getElementById(speedLabelId);

        this.paused = false;
        this.position = null;
        this.frames = 0;
        this.result = null;
        this.speed = 1;

        this.button.addEventListener('click', () => onToggle());

        // перемотка сама по себе означает паузу — иначе кадр тут же убежит
        this.slider.addEventListener('input', () => onSeek(Number(this.slider.value)));

        this.speedSlider.min = '0';
        this.speedSlider.max = String(SPEEDS.length - 1);
        this.speedSlider.step = '1';
        this.speedSlider.addEventListener('input', () => {
            this.setSpeed(Number(this.speedSlider.value));
        });
        this.setSpeed(NORMAL_SPEED);
    }

    setPaused(paused) {
        this.paused = paused;
        this.button.textContent = paused ? '▶ Играть' : '⏸ Пауза';
    }

    // index — позиция на шкале SPEEDS, а не сам множитель
    setSpeed(index) {
        this.speed = SPEEDS[index];
        this.speedSlider.value = String(index);
        this.speedLabel.textContent = '×' + this.speed;
    }

    // position === null — живой режим, ползунок стоит в конце
    setPosition(position) {
        this.position = position;
        if (position !== null) {
            this.slider.value = String(position);
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
        this.setPaused(false);
    }

    // frames — сколько кадров сейчас в истории
    render(frames, tick) {
        if (frames !== this.frames) {
            this.frames = frames;
            this.slider.max = String(Math.max(0, frames - 1));
            this.slider.disabled = frames === 0;
        }

        if (this.position !== null) {
            this.label.textContent = `кадр ${this.position + 1} из ${frames} · тик ${tick}`;
            return;
        }

        this.slider.value = this.slider.max;
        this.label.textContent = this.result
            ? `${this.result} · тик ${tick}`
            : 'живой режим · тик ' + tick;
    }
}
