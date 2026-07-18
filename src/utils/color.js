// Работа с цветом. Требует DOM (canvas для разбора CSS-цветов).

// Инверсия цвета. bw = true -> вернуть контрастный чёрный или белый.
export function invertColor(hex, bw) {
    if (hex.indexOf('#') === 0) {
        hex = hex.slice(1);
    }
    // 3-значный hex -> 6-значный
    if (hex.length === 3) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6) {
        throw new Error('Invalid HEX color.');
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    if (bw) {
        // http://stackoverflow.com/a/3943023/112731
        return (r * 0.299 + g * 0.587 + b * 0.114) > 186 ? '#000000' : '#FFFFFF';
    }

    return '#' + byteToHex(255 - r) + byteToHex(255 - g) + byteToHex(255 - b);
}

// colorToHex('red') -> '#ff0000'
export function colorToHex(color) {
    const rgba = colorToRGBA(color);
    return '#' + [0, 1, 2].map((idx) => byteToHex(rgba[idx])).join('');
}

// Любой валидный CSS-цвет -> [r, g, b, a], каждый компонент 0-255.
export function colorToRGBA(color) {
    const cvs = document.createElement('canvas');
    cvs.width = 1;
    cvs.height = 1;

    const ctx = cvs.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);

    return ctx.getImageData(0, 0, 1, 1).data;
}

// Число 0-255 -> двухсимвольный hex
export function byteToHex(num) {
    return ('0' + num.toString(16)).slice(-2);
}
