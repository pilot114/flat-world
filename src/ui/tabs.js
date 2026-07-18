// Полоска вкладок: items — [{id, name}], выбор отдаётся в onSelect.
// Набор вкладок задаётся при создании; чтобы его сменить, полоску пересобирают
// заново — так делает панель выделенного существа, у которого свои классы.
export class Tabs {
    constructor(id, items, onSelect) {
        this.items = items;
        this.onSelect = onSelect;
        this.selected = null;
        this.buttons = new Map();

        const container = document.getElementById(id);
        container.replaceChildren();

        for (const item of items) {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'tab';
            el.textContent = item.name;
            el.addEventListener('click', () => this.select(item.id));

            container.appendChild(el);
            this.buttons.set(item.id, el);
        }
    }

    // Повторный выбор активной вкладки тоже зовёт onSelect: для сценариев
    // это перезапуск мира, и отдельной кнопки под него не нужно.
    select(id) {
        const item = this.items.find((candidate) => candidate.id === id);
        if (!item) {
            throw new Error('Unknown scenario: ' + id);
        }

        this.selected = id;
        for (const [itemId, el] of this.buttons) {
            el.classList.toggle('active', itemId === id);
        }

        this.onSelect(item);
    }
}
