---
title: 'Scaffold, деплой и тёмная страница с искрой'
type: feature
ticket: '1'
created: '2026-11-19'
status: done
baseline_revision: 'NO_VCS'
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Проекта нет вообще: нет scaffold, нет страницы, нет способа открыть сайт по URL. Story 1.1 — tracer bullet инициативы: тончайший путь через все слои (каркас → рендер → деплой → проверка человеком).

**Approach:** Завести минимальный статический проект на 2D Canvas без внешних библиотек рендера, отрисовать тёмную страницу с одной искрой «зажги» и подписью, покрыть рендер искры тестом; проверка — локальный сервер (Decision 2026-11-19: URL-деплой вынесен в отдельную задачу эпика).

## Boundaries & Constraints

**Always:** 2D Canvas, никаких графических библиотек и внешних зависимостей рендера; тесты на встроенных средствах Node (node:test) без установки дев-зависимостей; первый рендер — чёрный экран с одной искрой и текстом «зажги».

**Never:** Никакого ритуала касания/проявления мира (это story 1.3), никакого счётчика, звёзды, слоёв мира (эпики 2–4), никаких поп-апов и преград на входе. URL-деплой — вне этой story (Decision 2026-11-19: локальная проверка, деплой отдельной задачей).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Первый рендер | страница открыта, canvas 2D доступен | чёрный фон, одна жёлто-белая искра в центре-выше, подпись «зажги» | — |
| Ресайз окна | изменение размеров окна | canvas растягивается, искра остаётся на месте | — |
| Нет canvas 2D | старый браузер | текстовая заглушка вместо пустоты | деградация без падения |
</frozen-after-approval>

## Code Map

- Проект зелёный: в `/home/il77/projects/3xsite/` кода нет (`package.json` отсутствует) — пересматривать нечего, всё создаётся с нуля.
- `_bmad-output/initiative-new-year-tree/tickets/epic-scene/epic-scene.md` -- эпик: Requirements R1–R5, решения (localStorage, контракт рендера — не здесь).
- `_bmad-output/initiative-new-year-tree/initiative-new-year-tree.md` -- Requirements инициативы; R4 читается как «деплой общий по устройству, сервер появляется с эпика 2» (Decision 2026-11-19).

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- каркас: scripts `dev`/`build`/`test`, ноль runtime-зависимостей -- базовый scaffold
- [x] `index.html` -- разметка: full-screen canvas, подпись «зажги», тёмный фон -- страница-точка входа
- [x] `src/spark.js` -- чистая функция `drawSpark(ctx, x, y, t)` -- тестируемое ядро рендера искры
- [x] `src/main.js` -- bootstrap: размер canvas, рендер-цикл (один кадр достаточно), вызов drawSpark -- связка
- [x] `test/spark.test.js` -- node:test: мок-ctx фиксирует вызовы, drawSpark рисует лучи/свечение -- «тест рендера искры проходит»
- [x] `README.md` -- как запустить локально -- шаг человека (hitl)

**Acceptance Criteria:**
- Given свежий `git clone`/распаковка, when открыть `index.html` через локальный сервер, then виден чёрный экран с одной искрой и подписью «зажги»
- Given мок-2D-контекст, when вызван `drawSpark`, then на контексте зафиксированы вызовы отрисовки лучей и свечения (тест зелёный)
- Given локальный сервер запущен, when человек открывает страницу, then чёрный экран, искра «зажги», без ошибок в консоли (URL-деплой — отдельная задача, Decision 2026-11-19)

## Implementation Notes

- Ноль зависимостей на практике: `dev` = свой статический сервер `scripts/serve.js` (node:http), `build` = копирование `index.html` + `src/` в `dist/` (`scripts/build.js`), `test` = `node --test` (v22). `npm install` не нужен.
- Искра позиционируется долями экрана (`SPARK_POSITION = {x: 0.5, y: 0.42}`), поэтому при ресайзе остаётся на месте (проверено скриншотами 1280×800 и 640×480).
- Деградация «нет canvas 2D» проверена через CDP (getContext → null): показывается `#fallback`, canvas и подпись скрываются, ошибок в консоли нет.
- Матрица I/O покрыта автотестами (`test/matrix.test.js`): логика кадра вынесена в `src/scene.js` (`renderFrame`/`sparkAt`), bootstrap — `bootstrap(doc, win)` в `src/main.js` с ручными стабами document/window (без jsdom). Поведение страницы не менялось (скриншот до/после идентичны).

## Plan Change Log

## Review Triage Log

- 2026-11-19 quick — index.html:18-23,59-62 — canvas не скрывается в деградации (авторский display: block перебивает UA [hidden]; тест ловит только DOM-свойство) — verdict low: подтверждено чтением CSS; визуально маскировано непрозрачным #fallback, вред только латентный для разработчика (story 1.5 может оголить) — fix: одно правило #scene[hidden] — route: patch.
- 2026-11-19 quick — index.html (нет link rel=icon) + serve.js:51-64 — запрос /favicon.ico → 404 в консоли, нарушает AC3 «без ошибок в консоли» — verdict medium: подтверждено, serve.js 404 на неизвестные пути, браузер запрашивает иконку всегда — fix: пустая data:-иконка — route: patch.
- 2026-11-19 quick — spark.js:27,32 — JSDoc обещает t в мс, sin(t) даёт период ≈6,3 мс (стробоскоп при t из story 1.5) — verdict low: подтверждено формулой; сейчас все вызовы t=0, поведение не страдает, но контракт неверен — fix: делитель в формуле, прямая правка — route: patch.
- 2026-11-19 quick — serve.js:10 — PORT не валидируется (пустая строка → listen(0), нечисло → краш) — verdict low, rejected: дефект только при невалидном env, фикс — добавление guard'а, маловероятно в повседневном использовании — отклонён по правилу low.

## Design Notes

Искра — статичный кадр (без анимации; анимация — scope story 1.5 «Живая сцена»). `drawSpark` чистая и принимает ctx как аргумент — поэтому тестируется на моке без jsdom/canvas-зависимостей, что и держит ноль dev-зависимостей. Подпись «зажги» — DOM-элемент над canvas, не рисуется на canvas (проще и доступнее).

## Verification

**Commands:**
- `npm test` -- ✅ 2026-11-22: 43/43 зелёные, exit 0
- `npm run build` -- ✅ 2026-11-22: exit 0, статика собрана в `dist/`

**Manual checks (if no CLI):**
- Запустить локальный сервер, открыть страницу: чёрная, искра, «зажги», без консольных ошибок; повторить во втором браузере
- ✅ **2026-11-22, проверка человеком: работает.** Локальный запуск показывает чёрный экран с искрой; деплой по адресу `zaytse3x.ddns.net` перенесён в `epic-garland` (Decision 2026-11-22).
