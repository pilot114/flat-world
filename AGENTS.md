# flat-world

Симуляция плоского мира на canvas: существа живут по простым правилам, рядом в реальном времени строится
график численности видов. Без зависимостей и сборки. Управление и сценарии — `readme.md`.

## Как устроено

- Ядро симуляции отделено от отрисовки и покрыто тестами на `node --test` (`npm test`).
- Иерархия существ — классы `Base` → `Creature` → `Unit`/`Stone`; клик по канвасу показывает поля
  выбранного существа таблицей по классам, которые их объявили.

## Команды

Обслуживание — как в pretty-php: `npm run test`, `npm run check`, `npm run fix`.

- `check` — eslint, prettier --check; ничего не меняет
- `fix` — eslint --fix, prettier --write
- `test` — node --test

Цели Makefile одинаковые во всех проектах `~/projects` (`make help` — список):

- `make install` — поставить зависимости
- `make dev` — http://localhost:8080
- `make build` — сборка
- `make audit` — уязвимости в зависимостях
- `make outdated` — устаревшие зависимости
