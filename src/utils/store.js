// Сохранение мира между перезагрузками страницы.
//
// Хранится полный слепок — тот же, что мир пишет в ключевые кадры. Можно было
// бы сохранять seed и журнал вмешательств, они втрое короче, но тогда при
// загрузке пришлось бы переигрывать все прошедшие тики: десять минут возни
// в песочнице — это тридцать шесть тысяч тиков и несколько секунд ожидания
// на белой странице. Слепок разворачивается сразу.
//
// История и журнал при этом не сохраняются: перемотка начинается заново
// с момента загрузки. Прошлое, которого не видел текущий сеанс, всё равно
// нечем показать — кадров картинки в слепке нет.

// Буфер слепка — двоичный, а localStorage хранит строки.
function toText(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';

    // посимвольно строка собиралась бы вечно, а разом — упирается в предел
    // числа аргументов, поэтому кусками
    for (let at = 0; at < bytes.length; at += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(at, at + 0x8000));
    }

    return btoa(binary);
}

function toBuffer(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}

export function save(key, snapshot) {
    try {
        localStorage.setItem(key, JSON.stringify({ ...snapshot, buffer: toText(snapshot.buffer) }));
        return true;
    } catch (error) {
        // Место кончилось или хранилище недоступно — приватный режим, запрет
        // в настройках. Песочница от этого работать не перестаёт, просто
        // не переживёт перезагрузку.
        return false;
    }
}

export function load(key) {
    try {
        const text = localStorage.getItem(key);
        if (!text) {
            return null;
        }

        const saved = JSON.parse(text);
        return { ...saved, buffer: toBuffer(saved.buffer) };
    } catch (error) {
        // сохранение от прежней версии: раскладка слепка могла измениться,
        // и разбирать его нечем — начинаем с чистого мира
        clear(key);
        return null;
    }
}

export function clear(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        // нечего чистить
    }
}
