// Мелкие DOM-хелперы.

export function objectToString(obj) {
    return Object.keys(obj)
        .map((property) => property + ': ' + obj[property])
        .join('\n');
}

// Координаты клика относительно левого верхнего угла элемента.
export function getEventLocation(element, event) {
    const rect = element.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}
