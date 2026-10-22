// Полоска вкладок: items — [{id, name}], выбор отдаётся в onSelect.
//
// Это группа переключателей, как и ряд скоростей: выбран ровно один, и видно
// сразу все. Браузер сам гасит соседей по имени группы, поэтому подсветку
// активной вкладки задаёт CSS, а не код.
//
// Слушаем click, а не change: change не срабатывает на уже выбранном, а повтор
// по активной вкладке — это перезапуск сценария, и отдельной кнопки под него
// заводить не хочется.
export class Tabs {
  constructor(id, items, onSelect) {
    this.items = items;
    this.onSelect = onSelect;
    this.selected = null;
    this.buttons = new Map();

    const container = document.getElementById(id);
    container.replaceChildren();
    container.className = 'chips';

    for (const item of items) {
      const label = document.createElement('label');
      label.className = 'chip';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = id;
      input.addEventListener('click', () => this.select(item.id));

      const text = document.createElement('span');
      text.textContent = item.name;

      label.append(input, text);
      container.appendChild(label);
      this.buttons.set(item.id, input);
    }
  }

  select(id) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) {
      throw new Error('Unknown scenario: ' + id);
    }

    this.selected = id;
    this.buttons.get(id).checked = true;
    this.onSelect(item);
  }
}
