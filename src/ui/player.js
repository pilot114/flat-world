// Управление воспроизведением: пауза и перемотка по записанным кадрам.
// Живой режим — position === null, иначе показываем кадр истории.
export class Player {
    constructor({ buttonId, sliderId, labelId }, { onToggle, onSeek }) {
        this.button = document.getElementById(buttonId);
        this.slider = document.getElementById(sliderId);
        this.label = document.getElementById(labelId);

        this.paused = false;
        this.position = null;
        this.frames = 0;
        this.result = null;

        this.button.addEventListener('click', () => onToggle());

        // перемотка сама по себе означает паузу — иначе кадр тут же убежит
        this.slider.addEventListener('input', () => onSeek(Number(this.slider.value)));
    }

    setPaused(paused) {
        this.paused = paused;
        this.button.textContent = paused ? '▶ Играть' : '⏸ Пауза';
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
