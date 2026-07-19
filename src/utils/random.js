// Генератор псевдослучайных чисел мира.
//
// mulberry32 выбран не за качество распределения — здесь оно ни на что
// не влияет, — а за то, что всё его состояние умещается в одно 32-битное
// число. Такое состояние можно положить в ключевой кадр и продолжить поток
// ровно с того места, где он был: без этого восстановленный мир пошёл бы
// по другой случайности и разошёлся бы с настоящим на первом же дрейфе.
export class Random {
    constructor(seed) {
        this.state = seed >>> 0;
    }

    // Число в [0, 1).
    next() {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Целое из диапазона включительно: int(0, 360) -> 0..360
    int(min, max) {
        return Math.floor(min + this.next() * (max + 1 - min));
    }

    // Точка внутри прямоугольника мира.
    point(width, height) {
        return {
            x: Math.floor(this.next() * width) + 1,
            y: Math.floor(this.next() * height) + 1
        };
    }
}

// Случайный seed для нового мира. Мир, запущенный без seed, всё равно
// воспроизводим — свой seed он запоминает и кладёт в журнал.
export function randomSeed() {
    return Math.floor(Math.random() * 0x100000000);
}
